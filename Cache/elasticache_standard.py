import os
import logging
import redis
from Cache.utils import clean_query, hash_query
from dotenv import load_dotenv
load_dotenv()

# Module logger
logger = logging.getLogger(__name__)

class ElastiCacheMemory:
    def __init__(self, stopwords_path, ssl=True):
        self.endpoint = os.getenv("ELASTICACHE_ENDPOINT", "tool-use-agent-cache-valkey-h6awpu.serverless.apse2.cache.amazonaws.com")
        self.port = int(os.getenv("ELASTICACHE_PORT", "6379"))
        # Default SSL to True for ElastiCache, but allow override via env or arg
        self.ssl = os.getenv("ELASTICACHE_SSL", str(ssl)).lower() == "true"

        if not self.endpoint:
            logger.warning("ELASTICACHE_ENDPOINT not set. Using 'localhost' as fallback.")
            self.endpoint = "localhost"

        try:
            self.r = redis.Redis(
                host=self.endpoint, 
                port=self.port, 
                db=0, 
                decode_responses=True,
                ssl=self.ssl
            )
            # attempt a lightweight ping to detect connectivity early
            try:
                self.r.ping()
                logger.info(f"Connected to ElastiCache at {self.endpoint}:{self.port}")
            except Exception:
                logger.warning(f"Unable to ping ElastiCache at {self.endpoint}:{self.port}; connection may be established later")
        except Exception as e:
            logger.exception("Failed to create ElastiCache Redis client: %s", e)
            # create a fallback client object to avoid AttributeErrors later
            self.r = redis.Redis(
                host=self.endpoint, 
                port=self.port, 
                db=0, 
                decode_responses=True,
                ssl=self.ssl
            )

        self.stopwords = self.get_stopwords(stopwords_path)

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

    def set_cache(self, query, answer):
        try:
            clean_q = clean_query(query, self.stopwords)
            key = hash_query(clean_q)
            self.r.hset(key, mapping={"answer": answer})
            logger.debug("Cache set for key=%s", key)
        except Exception:
            logger.exception("Failed to set cache for query: %s", query)

    def get_cache(self, query):
        try:
            clean_q = clean_query(query, self.stopwords)
            key = hash_query(clean_q)
            data = self.r.hgetall(key)
            logger.debug("Cache lookup for key=%s found=%s", key, bool(data))
            return data if data else None
        except Exception:
            logger.exception("Failed to get cache for query: %s", query)
            return None
    
    def delete_cache(self, query):
        try:
            clean_q = clean_query(query, self.stopwords)
            key = hash_query(clean_q)
            self.r.delete(key)
            logger.debug("Deleted cache for key=%s", key)
            return True
        except Exception:
            logger.exception("Failed to delete cache for query: %s", query)
            return False
    
    def delete_all(self):
        try:
            self.r.flushdb()
            logger.info("Flushed all cache from ElastiCache")
        except Exception:
            logger.exception("Failed to flush ElastiCache database")

    def get_all_cache(self):
        try:
            all_data = {}
            # Use scan_iter for better performance on large datasets compared to keys()
            for key in self.r.scan_iter("*"):
                data = self.r.hgetall(key)
                if data:
                    all_data[key] = data
            logger.debug("Retrieved all cache entries: %d items", len(all_data))
            return all_data
        except Exception:
            logger.exception("Failed to retrieve all cache entries")
            return {}

    def count_cache(self):
        try:
            size = self.r.dbsize()
            logger.debug("ElastiCache DB size: %s", size)
            return size
        except Exception:
            logger.exception("Failed to get ElastiCache DB size")
            return 0

if __name__ == "__main__":
    # configure basic logging for standalone runs
    logging.basicConfig(level=logging.INFO)
    cache_memory = ElastiCacheMemory(stopwords_path=os.getenv("STOPWORD_PATH"))
    try:
        print(cache_memory.get_cache("Quy trình phát triển phần mềm gồm những giai đoạn nào?"))
        print("All cache entries:", cache_memory.get_all_cache())
    except Exception:
        logger.exception("Error while running cache example")
