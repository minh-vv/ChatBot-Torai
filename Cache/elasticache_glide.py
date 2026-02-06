import os
import logging
import asyncio

from glide import (
    ClosingError,
    ConnectionError,
    GlideClusterClient,
    GlideClusterClientConfiguration,
    Logger,
    LogLevel,
    NodeAddress,
    RequestError,
    TimeoutError,
)
from utils import clean_query, hash_query

# Module logger
logger = logging.getLogger(__name__)

class ElastiCacheMemory:
    def __init__(self, stopwords_path, ssl=True):
        self.endpoint = os.getenv("ELASTICACHE_ENDPOINT", "cache-test-elasticache-h6awpu.serverless.apse2.cache.amazonaws.com")
        self.port = int(os.getenv("ELASTICACHE_PORT", "6379"))
        # Default SSL to True for ElastiCache, but allow override via env or arg
        self.ssl = os.getenv("ELASTICACHE_SSL", str(ssl)).lower() == "true"

        if not self.endpoint:
            logger.warning("ELASTICACHE_ENDPOINT not set. Using 'localhost' as fallback.")
            self.endpoint = "localhost"
        
        # Configure Glide Logger
        Logger.set_logger_config(LogLevel.INFO)

        self.addresses = [NodeAddress(self.endpoint, self.port)]
        self.config = GlideClusterClientConfiguration(addresses=self.addresses, use_tls=self.ssl)
        self.client = None

        self.stopwords = self.get_stopwords(stopwords_path)

    async def connect(self):
        if self.client:
            return
        try:
            self.client = await GlideClusterClient.create(self.config)
            logger.info(f"Connected to ElastiCache at {self.endpoint}:{self.port}")
        except Exception as e:
            logger.exception("Failed to create ElastiCache Glide client: %s", e)
            self.client = None

    async def close(self):
        if self.client:
            try:
                await self.client.close()
                logger.info("Client connection closed.")
                self.client = None
            except ClosingError as e:
                logger.exception(f"Error closing client: {e}")

    def get_stopwords(self, stopwords_path):
        if not stopwords_path:
            logger.warning("No stopwords_path provided; using empty stopwords set")
            return set()

        try:
            with open(stopwords_path, 'r', encoding='utf-8') as f:
                stopwords = set(line.strip().replace(' ', '_') for line in f if line.strip())
            logger.info("Loaded %d stopwords from %s", len(stopwords), stopwords_path)
            return stopwords
        except FileNotFoundError:
            logger.warning("Stopwords file not found: %s. Using empty stopwords set.", stopwords_path)
            return set()
        except Exception as e:
            logger.exception("Error loading stopwords from %s: %s", stopwords_path, e)
            return set()

    async def set_cache(self, query, answer):
        if not self.client:
            await self.connect()
        
        if not self.client:
            logger.error("Client not connected, cannot set cache")
            return

        try:
            clean_q = clean_query(query, self.stopwords)
            key = hash_query(clean_q)
            # Assuming hset supports mapping like redis-py
            await self.client.hset(key, {"answer": answer})
            logger.debug("Cache set for key=%s", key)
        except Exception:
            logger.exception("Failed to set cache for query: %s", query)

    async def get_cache(self, query):
        if not self.client:
            await self.connect()
        
        if not self.client:
            return None

        try:
            clean_q = clean_query(query, self.stopwords)
            key = hash_query(clean_q)
            data = await self.client.hgetall(key)
            logger.debug("Cache lookup for key=%s found=%s", key, bool(data))
            return data if data else None
        except Exception:
            logger.exception("Failed to get cache for query: %s", query)
            return None
    
    async def delete_cache(self, query):
        if not self.client:
            await self.connect()
        
        if not self.client:
            return False

        try:
            clean_q = clean_query(query, self.stopwords)
            key = hash_query(clean_q)
            # Assuming delete takes a list of keys
            await self.client.delete([key])
            logger.debug("Deleted cache for key=%s", key)
            return True
        except Exception:
            logger.exception("Failed to delete cache for query: %s", query)
            return False
    
    async def delete_all(self):
        if not self.client:
            await self.connect()
        
        if not self.client:
            return

        try:
            # Assuming flushdb exists
            await self.client.flushdb()
            logger.info("Flushed all cache from ElastiCache")
        except Exception:
            logger.exception("Failed to flush ElastiCache database")

    async def get_all_cache(self):
        if not self.client:
            await self.connect()
        
        if not self.client:
            return {}

        try:
            all_data = {}
            
            logger.debug("Retrieved all cache entries: %d items", len(all_data))
            return all_data
        except Exception:
            logger.exception("Failed to retrieve all cache entries")
            return {}

    async def count_cache(self):
        if not self.client:
            await self.connect()
        
        if not self.client:
            return 0

        try:
            size = await self.client.dbsize()
            logger.debug("ElastiCache DB size: %s", size)
            return size
        except Exception:
            logger.exception("Failed to get ElastiCache DB size")
            return 0

async def main():
    # configure basic logging for standalone runs
    logging.basicConfig(level=logging.INFO)
    cache_memory = ElastiCacheMemory(stopwords_path=os.getenv("STOPWORD_PATH", "/home/ubuntu/stopwords_vi.txt"))
    
    try:
        await cache_memory.connect()
        print(await cache_memory.set_cache("Hello", "abcdef"))
        print("All cache entries:", await cache_memory.get_all_cache())
    except Exception:
        logger.exception("Error while running cache example")
    finally:
        await cache_memory.close()

if __name__ == "__main__":
    asyncio.run(main())
