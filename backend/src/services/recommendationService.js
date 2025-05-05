import fetch from 'node-fetch';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import logger from './logger.js';
import { DefaultAzureCredential } from '@azure/identity';

// Load environment variables
dotenv.config();

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import destinations data
const destinationsPath = path.join(__dirname, '../data/destinations.json');
const destinationEmbeddingsPath = path.join(__dirname, '../data/destination-embeddings.json');

// Load destinations
const destinations = JSON.parse(fs.readFileSync(destinationsPath, 'utf8'));

// Load destination embeddings (if available)
let destinationEmbeddings = {};
try {
  if (fs.existsSync(destinationEmbeddingsPath)) {
    destinationEmbeddings = JSON.parse(fs.readFileSync(destinationEmbeddingsPath, 'utf8'));
    logger.info(`Loaded ${Object.keys(destinationEmbeddings).length} destination embeddings`);
  } else {
    logger.warn('Destination embeddings file not found. Recommendations will require real-time embedding generation.');
  }
} catch (error) {
  logger.error('Error loading destination embeddings:', error);
}

// Network request timeout and retry settings
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '15000', 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10);
const RETRY_DELAY_MS = parseInt(process.env.RETRY_DELAY_MS || '2000', 10);
const RATE_LIMIT_DELAY_MS = parseInt(process.env.RATE_LIMIT_DELAY_MS || '1000', 10);

/**
 * Sleep for a given number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Service for generating travel recommendations based on user input
 * Uses Azure OpenAI embeddings to match user preferences with destinations
 * Supports both Workload Identity and API key authentication
 */
class RecommendationService {
  constructor() {
    // Azure OpenAI configuration
    this.endpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
    this.deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT || 'text-embedding-ada-002';
    this.apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2023-05-15';
    
    // API key authentication for Azure OpenAI
    this.apiKey = process.env.AZURE_OPENAI_API_KEY || '';
    
    // Determine if we should use API key authentication
    this.useApiKey = !!this.apiKey;
    
    // Rate limiting - Implement a semaphore to limit concurrent requests
    this.requestQueue = [];
    this.maxConcurrentRequests = parseInt(process.env.MAX_CONCURRENT_REQUESTS || '2', 10);
    this.activeRequests = 0;
    
    // Cache destination embeddings to reduce API calls
    this.embeddingCache = new Map();
    
    // Log initialization
    logger.info('RecommendationService initialized with config:', {
      endpoint: this.endpoint ? `${this.endpoint.substring(0, 15)}...` : 'Not configured',
      deploymentName: this.deploymentName || 'Not configured',
      apiVersion: this.apiVersion,
      authMethod: this.useApiKey ? 'API Key' : 'Workload Identity',
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
      retryDelayMs: RETRY_DELAY_MS,
      maxConcurrentRequests: this.maxConcurrentRequests
    });
    
    // Azure AD Workload Identity configuration
    this.tenantId = process.env.AZURE_TENANT_ID || '';
    this.clientId = process.env.AZURE_OPENAI_CLIENTID || '';
    this.clientSecret = process.env.AZURE_CLIENT_SECRET || '';
    this.resource = process.env.AZURE_OPENAI_ENDPOINT || '';
    this.useWorkloadIdentity = !this.apiKey && this.resource;

    if (this.useWorkloadIdentity) {
      logger.info('Using Azure AD Workload Identity with DefaultAzureCredential for authentication');
    }
  }

  async getAccessToken() {
    if (!this.useWorkloadIdentity) {
      throw new Error('Workload Identity is not configured.');
    }

    try {
      logger.info('Attempting to acquire token using DefaultAzureCredential');
      
      const startTime = performance.now();
      // Get token using DefaultAzureCredential
      const credential = new DefaultAzureCredential();
      
      // Format the scope correctly based on the endpoint URL
      const scope = "https://cognitiveservices.azure.com/.default";
      
      logger.info(`Requesting token with scope: ${scope}`);
      const accessToken = await credential.getToken(scope);
      
      const endTime = performance.now();
      const tokenDuration = endTime - startTime;
      
      if (accessToken && accessToken.token) {
        const tokenLength = accessToken.token.length;
        const tokenPreview = `${accessToken.token.substring(0, 6)}...${accessToken.token.substring(tokenLength - 6)}`;
        
        logger.success(`Successfully acquired access token in ${tokenDuration.toFixed(2)}ms: ${tokenPreview} (${tokenLength} chars)`);
        
        return accessToken.token;
      } else {
        logger.warn('Token acquired but has unexpected format or missing fields');
        throw new Error('Invalid token format received from DefaultAzureCredential');
      }
    } catch (error) {
      logger.error('Failed to acquire token using DefaultAzureCredential:', error);
      throw error;
    }
  }

  /**
   * Queue a function to be executed with respect to rate limits
   * @param {Function} fn - Function to execute
   * @returns {Promise<any>} - Result of the function
   */
  async enqueueRequest(fn) {
    return new Promise((resolve, reject) => {
      const executeRequest = async () => {
        this.activeRequests++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.activeRequests--;
          this.processQueue();
        }
      };

      if (this.activeRequests < this.maxConcurrentRequests) {
        executeRequest();
      } else {
        this.requestQueue.push(executeRequest);
      }
    });
  }

  /**
   * Process the next request in the queue
   */
  processQueue() {
    if (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
      const nextRequest = this.requestQueue.shift();
      nextRequest();
    }
  }

  /**
   * Generate embeddings for a given text using Azure OpenAI
   * @param {string} text - Text to generate embeddings for
   * @returns {Promise<Array<number>>} - Vector embedding of the text
   */
  async generateEmbedding(text) {
    // Check if we have this embedding cached
    const cacheKey = this.getCacheKey(text);
    if (this.embeddingCache.has(cacheKey)) {
      logger.info(`Using cached embedding for text: "${text.substring(0, 30)}..."`);
      return this.embeddingCache.get(cacheKey);
    }

    // Not in cache, queue the API request with rate limiting
    return this.enqueueRequest(async () => {
      try {
        // Validate required configuration
        if (!this.endpoint) {
          const error = new Error('Azure OpenAI endpoint is not configured. Please set AZURE_OPENAI_ENDPOINT environment variable.');
          logger.error('Configuration validation failed:', error);
          throw error;
        }

        if (!this.deploymentName) {
          const error = new Error('Azure OpenAI deployment name is not configured. Please set AZURE_OPENAI_DEPLOYMENT environment variable.');
          logger.error('Configuration validation failed:', error);
          throw error;
        }

        const url = `${this.endpoint}openai/deployments/${this.deploymentName}/embeddings?api-version=${this.apiVersion}`;
        
        // Log the API call with truncated text (for privacy/brevity)
        const truncatedText = text.length > 50 ? `${text.substring(0, 50)}...` : text;
        logger.info(`Calling Azure OpenAI API for embeddings with text: "${truncatedText}"`, {
          url: url,
          authMethod: this.useApiKey ? 'API Key' : 'Workload Identity',
          textLength: text.length
        });
        
        // Configure fetch options
        const fetchOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: text,
            model: this.deploymentName
          }),
          timeout: REQUEST_TIMEOUT_MS
        };
        
        // Add API key authentication if available
        if (this.useApiKey) {
          logger.info('Using API key authentication');
          fetchOptions.headers['api-key'] = this.apiKey;
        } else if (this.useWorkloadIdentity) {
          logger.info('Acquiring token using Workload Identity');
          const accessToken = await this.getAccessToken();
          fetchOptions.headers['Authorization'] = `Bearer ${accessToken}`;
        }
        
        let lastError = null;
        let retryCount = 0;
        
        // Implement retry logic with exponential backoff
        while (retryCount <= MAX_RETRIES) {
          const startTime = performance.now();
          try {
            // If not the first attempt, log retry information
            if (retryCount > 0) {
              logger.info(`Retry ${retryCount}/${MAX_RETRIES} for embedding generation after ${RETRY_DELAY_MS * retryCount}ms`);
            }
            
            const response = await fetch(url, fetchOptions);
            const endTime = performance.now();
            const requestDuration = endTime - startTime;
            
            if (!response.ok) {
              let errorData;
              try {
                errorData = await response.json();
              } catch (e) {
                errorData = { error: { message: 'Failed to parse error response' } };
              }
              
              // Check specifically for rate limiting errors
              if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                const retryDelayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_DELAY_MS * Math.pow(2, retryCount);
                
                logger.warn(`Rate limit exceeded (429). Will retry after ${retryDelayMs}ms.`);
                retryCount++;
                
                if (retryCount <= MAX_RETRIES) {
                  await sleep(retryDelayMs);
                  continue;
                }
              }
              
              const error = new Error(`Azure OpenAI API Error: ${errorData.error?.message || response.statusText}`);
              error.status = response.status;
              logger.error(`API call failed with status ${response.status} (${requestDuration.toFixed(2)}ms):`, error);
              throw error;
            }
            
            const data = await response.json();
            logger.success(`Embedding generated successfully (${requestDuration.toFixed(2)}ms)`, {
              embeddingSize: data.data?.[0]?.embedding?.length || 'unknown'
            });
            
            const embedding = data.data[0].embedding;
            
            // Cache the result
            this.embeddingCache.set(cacheKey, embedding);
            
            // Add a small delay between requests to avoid triggering rate limits
            await sleep(RATE_LIMIT_DELAY_MS);
            
            return embedding;
          } catch (error) {
            lastError = error;
            retryCount++;
            
            // Check if we've exhausted our retries
            if (retryCount > MAX_RETRIES) {
              logger.error(`All ${MAX_RETRIES} retries failed when generating embedding:`, error);
              throw error;
            }
            
            // Network errors are potentially transient, so we should retry
            const isNetworkError = error.code === 'ECONNRESET' || 
                                  error.code === 'ETIMEDOUT' || 
                                  error.code === 'ENOTFOUND' ||
                                  error.code === 'ENETUNREACH' ||
                                  error.message.includes('network timeout');
            
            // Retry on network errors, 429 (rate limit) or 5xx server errors
            if (isNetworkError || error.status === 429 || (error.status >= 500 && error.status < 600)) {
              // Calculate backoff time, with special handling for rate limits
              const backoffTime = error.status === 429 
                ? Math.max(RETRY_DELAY_MS * Math.pow(2, retryCount), 10000) // At least 10 seconds for rate limits
                : RETRY_DELAY_MS * retryCount;
                
              logger.warn(`Error occurred: ${error.message}. Will retry in ${backoffTime}ms.`);
              await sleep(backoffTime);
              continue;
            } else {
              // For non-network errors (like auth problems or bad requests), don't retry
              logger.error('Non-retriable error occurred when generating embedding:', error);
              throw error;
            }
          }
        }
        
        throw lastError; // This should never happen but is a safeguard
      } catch (error) {
        logger.error('Error generating embedding:', error);
        throw error;
      }
    });
  }

  /**
   * Generate a cache key for a text string
   * @param {string} text - Text to generate key for
   * @returns {string} - Cache key
   */
  getCacheKey(text) {
    // Simple hash function for text
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `text_${hash}`;
  }

  /**
   * Calculate cosine similarity between two vectors
   * @param {Array<number>} vecA - First vector
   * @param {Array<number>} vecB - Second vector
   * @returns {number} - Similarity score between 0 and 1
   */
  cosineSimilarity(vecA, vecB) {
    // Calculate dot product
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    
    // Calculate magnitudes
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    
    // Calculate cosine similarity
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Get destination recommendations based on user input
   * @param {string} userInput - User's preferences or query
   * @returns {Promise<Object>} - Most relevant destination
   */
  async getRecommendation(userInput) {
    logger.info(`Getting recommendation for user input: "${userInput.substring(0, 50)}..."`);
    const startTime = performance.now();
    
    try {
      // Generate embedding for user input
      logger.info('Generating embedding for user input');
      const userEmbedding = await this.generateEmbedding(userInput);
      
      // Prepare destination descriptions for comparison
      logger.info(`Preparing descriptions for ${destinations.length} destinations`);
      
      // Create scored destinations array based on destination IDs
      const scoredDestinations = [];
      
      // First try to use pre-generated embeddings from the embeddings file
      for (const destination of destinations) {
        if (destination.id && destinationEmbeddings[destination.id]) {
          // Use the pre-generated embedding
          const embedding = destinationEmbeddings[destination.id];
          const score = this.cosineSimilarity(userEmbedding, embedding);
          
          scoredDestinations.push({
            destination,
            score
          });
        } else {
          // Generate embedding on-the-fly if not available
          // Create a rich description combining all relevant destination attributes
          const activitiesText = destination.activities ? `Activities you can enjoy: ${destination.activities.join(', ')}.` : '';
          const travelTypeText = destination.travelType ? `Perfect for: ${destination.travelType.join(', ')} travelers.` : '';
          const keywordsText = destination.keywords ? `Keywords: ${destination.keywords.join(', ')}.` : '';
          const nearbyAttractionsText = destination.nearbyAttractions ? `Nearby attractions: ${destination.nearbyAttractions.join(', ')}.` : '';
          
          const description = `${destination.city}, ${destination.country}. ${destination.tagline} ${destination.description || ''}
                           ${activitiesText}
                           ${travelTypeText}
                           Budget category: ${destination.budgetCategory || 'Moderate'}.
                           Best time to visit: ${destination.bestTimeToVisit}.
                           ${keywordsText}
                           ${nearbyAttractionsText}
                           ${destination.usp ? `What makes it special: ${destination.usp}` : ''}`.trim();
          
          try {
            logger.info(`Generating on-the-fly embedding for destination: ${destination.city}`);
            const embedding = await this.generateEmbedding(description);
            const score = this.cosineSimilarity(userEmbedding, embedding);
            
            scoredDestinations.push({
              destination,
              score
            });
          } catch (error) {
            logger.error(`Failed to generate embedding for ${destination.city}:`, error);
            // Skip this destination if embedding generation fails
          }
        }
      }
      
      // If we have no valid destinations with scores, throw an error
      if (scoredDestinations.length === 0) {
        throw new Error('Failed to generate embeddings for any destinations');
      }
      
      // Sort by similarity score (highest first)
      scoredDestinations.sort((a, b) => b.score - a.score);
      
      // Return the top 3 highest-scoring destinations
      const topDestinations = scoredDestinations.slice(0, 3).map(item => item.destination);
      
      // Return the highest-scoring destination
      const endTime = performance.now();
      const processingTime = endTime - startTime;
      logger.success(`Recommendation found in ${processingTime.toFixed(2)}ms: ${topDestinations[0].city}, ${topDestinations[0].country}`);
      
      return topDestinations[0];
    } catch (error) {
      const endTime = performance.now();
      const processingTime = endTime - startTime;
      logger.error(`No recommendation could be generated after ${processingTime.toFixed(2)}ms.`, error);
      throw error;
    }
  }

  isReady() {
    // Check if API key is provided or workload identity is configured
    const isConfigured = Boolean(process.env.AZURE_OPENAI_API_KEY || this.useWorkloadIdentity);
    return isConfigured;
  }
}

// Create a singleton instance
const recommendationService = new RecommendationService();

export default recommendationService;