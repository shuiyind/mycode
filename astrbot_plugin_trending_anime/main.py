"""
全网热搜与动漫按需查询工具
通过大模型Tool Calling能力获取实时热搜及动漫剧集信息
"""

import re
import json
import time
from typing import Dict, Any, Optional
from astrbot.api.star import Context, Star, register
from astrbot.api.event import AstrMessageEvent, MessageEventResult
from astrbot.api import logger
import httpx


@register("trending_anime", "shuiyind", "全网热搜与动漫按需查询工具 - 通过大模型Tool Calling能力获取实时热搜及动漫剧集信息", "1.0.0", "https://github.com/shuiyind/astrbot_plugin_trending_anime")
class TrendingAnimePlugin(Star):
    """
    全网热搜与动漫按需查询插件
    通过大模型Tool Calling能力获取实时热搜及动漫剧集信息
    """
    
    def __init__(self, context: Context):
        super().__init__(context)
        self.tools_registered = False
        
        # 注册工具函数供AI调用
        self.register_tools()

    def register_tools(self):
        """注册AI可调用的工具函数"""
        if not self.tools_registered:
            # 注册获取热搜工具
            self.context.add_llm_tools(
                TrendingNewsTool(),
                AnimeInfoTool()
            )
            self.tools_registered = True
            logger.info("TrendingAnimePlugin: 工具函数注册成功")
        
    async def terminate(self):
        """插件卸载/停用时的清理方法"""
        logger.info("TrendingAnimePlugin: 正在清理资源...")
        # 清理工具实例的缓存
        for tool in [TrendingNewsTool(), AnimeInfoTool()]:
            if hasattr(tool, 'clear_cache'):
                tool.clear_cache()
        logger.info("TrendingAnimePlugin: 资源清理完成")


class CachedToolBase:
    """带缓存功能的基础工具类"""
    
    def __init__(self, cache_ttl: int = 300):  # 默认5分钟缓存
        self.cache = {}  # 缓存字典
        self.cache_ttl = cache_ttl  # 缓存有效期（秒）
        self.last_request_time = {}  # 记录上次请求时间，用于限频
        self.request_interval = 1  # 最小请求间隔（秒），防止过于频繁的请求
    
    def _get_cache_key(self, *args, **kwargs) -> str:
        """生成缓存键"""
        key_parts = [str(arg) for arg in args]
        key_parts.extend([f"{k}:{v}" for k, v in sorted(kwargs.items())])
        return "_".join(key_parts)
    
    def _is_cache_valid(self, timestamp: float) -> bool:
        """检查缓存是否有效"""
        return time.time() - timestamp < self.cache_ttl
    
    def _get_cached_data(self, key: str):
        """获取缓存数据"""
        if key in self.cache:
            data, timestamp = self.cache[key]
            if self._is_cache_valid(timestamp):
                return data
            else:
                del self.cache[key]  # 删除过期缓存
        return None
    
    def _set_cache(self, key: str, data: Any):
        """设置缓存数据"""
        self.cache[key] = (data, time.time())
    
    def _can_make_request(self, key: str) -> bool:
        """检查是否可以发起请求（频率限制）"""
        current_time = time.time()
        if key in self.last_request_time:
            elapsed = current_time - self.last_request_time[key]
            if elapsed < self.request_interval:
                return False
        return True
    
    def _update_request_time(self, key: str):
        """更新请求时间"""
        self.last_request_time[key] = time.time()
    
    def clear_cache(self):
        """清空缓存"""
        self.cache.clear()
        self.last_request_time.clear()


class TrendingNewsTool(CachedToolBase):
    """获取热搜信息的工具类"""

    def __init__(self):
        super().__init__(cache_ttl=600)  # 热搜数据缓存10分钟，因为热搜变化相对较快

    @property
    def name(self):
        return "get_trending_news"

    @property
    def description(self):
        return "获取指定平台的热搜信息"

    @property
    def parameters(self):
        return {
            "type": "object",
            "properties": {
                "platform": {
                    "type": "string",
                    "description": "平台名称，支持: weibo(默认), zhihu, baidu, douyin",
                },
            },
            "required": [],
        }

    def sanitize_text(self, text: str) -> str:
        """
        数据预清洗函数
        1. 剔除HTML标签
        2. 压缩空白字符
        3. 截断过长文本
        """
        if not text:
            return ""

        # 1. 剔除HTML标签
        text = re.sub(r'<[^>]+>', '', text)

        # 2. 压缩空白字符（连续的换行符或空格合并为单个空格）
        text = re.sub(r'\s+', ' ', text)

        # 3. 截断过长文本（限制在200字符以内）
        if len(text) > 200:
            text = text[:200] + "...（内容已截断）"

        return text.strip()

    async def validate_configs(self, context: Context) -> Dict[str, str]:
        """
        验证配置项的有效性
        """
        configs = {}

        # 获取配置并去除首尾空格
        alapi_token = (context.get_config("alapi_token") or "").strip()
        custom_anime_api = (context.get_config("custom_anime_api") or "").strip()

        # 验证ALAPI Token
        if not alapi_token:
            return {
                "error": "未配置ALAPI Token，请前往插件管理页面填写",
                "alapi_token": None,
                "custom_anime_api": custom_anime_api
            }

        if len(alapi_token) < 10:
            return {
                "error": "ALAPI Token长度不足，请检查配置",
                "alapi_token": None,
                "custom_anime_api": custom_anime_api
            }

        # 验证自定义动漫API URL格式
        if custom_anime_api and not custom_anime_api.startswith(('http://', 'https://')):
            return {
                "error": "自定义动漫API URL格式不正确，请确保以http://或https://开头",
                "alapi_token": alapi_token,
                "custom_anime_api": None
            }

        configs["alapi_token"] = alapi_token
        configs["custom_anime_api"] = custom_anime_api

        return configs

    async def run(self, event: AstrMessageEvent, platform: str = "weibo"):
        """
        获取指定平台的热搜信息
        支持平台：weibo(默认), zhihu, baidu, douyin
        """
        # 生成缓存键
        cache_key = self._get_cache_key("trending_news", platform)
        
        # 检查缓存
        cached_data = self._get_cached_data(cache_key)
        if cached_data:
            logger.info(f"TrendingNewsTool: 使用缓存数据，平台: {platform}")
            return cached_data
        
        # 检查请求频率
        request_key = f"request_{cache_key}"
        if not self._can_make_request(request_key):
            return {
                "error": f"请求过于频繁，请稍后再试",
                "platform": platform
            }
        
        self._update_request_time(request_key)
        
        # 验证配置
        configs = await self.validate_configs(event.context)
        if "error" in configs:
            return {"error": configs["error"]}

        alapi_token = configs["alapi_token"]

        # 平台映射
        platform_map = {
            "weibo": "weibo_hot",
            "zhihu": "zhihu_hot",
            "baidu": "baidu_hot",
            "douyin": "douyin_hot"
        }

        # 如果传入的平台不在支持列表中，默认使用微博
        if platform not in platform_map:
            platform = "weibo"

        api_endpoint = f"https://v2.alapi.cn/api/{platform_map[platform]}"

        try:
            # 使用较长的超时时间，防止响应过慢
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    api_endpoint,
                    params={"token": alapi_token, "format": "json"}
                )

                if response.status_code != 200:
                    return {
                        "error": f"API请求失败，状态码: {response.status_code}",
                        "platform": platform
                    }

                data = response.json()

                # 检查API返回是否成功
                if data.get("code") != 200:
                    return {
                        "error": f"API返回错误: {data.get('msg', '未知错误')}",
                        "platform": platform
                    }

                # 提取热搜数据（不同平台可能有不同的字段名）
                news_list = []
                raw_data = data.get("data", [])

                # 限制返回前10-15条数据
                max_items = min(len(raw_data), 15)

                for i in range(max_items):
                    item = raw_data[i]

                    # 不同平台的热搜数据结构可能不同，尝试多种方式获取标题
                    title = ""
                    if isinstance(item, dict):
                        # 尝试常见的键名
                        title = (
                            item.get("title") or
                            item.get("keyword") or
                            item.get("title_word") or
                            item.get("topic") or
                            str(item.get("rank", f"热搜{i+1}"))
                        )
                    else:
                        title = str(item) if item else f"热搜{i+1}"

                    # 清洗标题文本
                    clean_title = self.sanitize_text(str(title))

                    news_list.append({
                        "rank": i + 1,
                        "title": clean_title
                    })

                result = {
                    "platform": platform,
                    "total_count": len(news_list),
                    "news": news_list
                }
                
                # 存储到缓存
                self._set_cache(cache_key, result)
                
                return result

        except httpx.TimeoutException:
            return {
                "error": "API请求超时，请稍后重试",
                "platform": platform
            }
        except httpx.RequestError as e:
            return {
                "error": f"API请求错误: {str(e)}",
                "platform": platform
            }
        except json.JSONDecodeError:
            return {
                "error": "API返回数据格式错误",
                "platform": platform
            }
        except Exception as e:
            return {
                "error": f"获取热搜时发生未知错误: {str(e)}",
                "platform": platform
            }


class AnimeInfoTool(CachedToolBase):
    """搜索动漫信息的工具类"""

    def __init__(self):
        super().__init__(cache_ttl=3600)  # 动漫信息缓存1小时，因为动漫信息变化较慢

    @property
    def name(self):
        return "search_anime_info"

    @property
    def description(self):
        return "搜索动漫信息"

    @property
    def parameters(self):
        return {
            "type": "object",
            "properties": {
                "keyword": {
                    "type": "string",
                    "description": "搜索关键词",
                },
            },
            "required": ["keyword"],
        }

    def sanitize_text(self, text: str) -> str:
        """
        数据预清洗函数
        1. 剔除HTML标签
        2. 压缩空白字符
        3. 截断过长文本
        """
        if not text:
            return ""

        # 1. 剔除HTML标签
        text = re.sub(r'<[^>]+>', '', text)

        # 2. 压缩空白字符（连续的换行符或空格合并为单个空格）
        text = re.sub(r'\s+', ' ', text)

        # 3. 截断过长文本（限制在200字符以内）
        if len(text) > 200:
            text = text[:200] + "...（内容已截断）"

        return text.strip()

    async def validate_configs(self, context: Context) -> Dict[str, str]:
        """
        验证配置项的有效性
        """
        configs = {}

        # 获取配置并去除首尾空格
        alapi_token = (context.get_config("alapi_token") or "").strip()
        custom_anime_api = (context.get_config("custom_anime_api") or "").strip()

        # 验证ALAPI Token
        if not alapi_token:
            return {
                "error": "未配置ALAPI Token，请前往插件管理页面填写",
                "alapi_token": None,
                "custom_anime_api": custom_anime_api
            }

        if len(alapi_token) < 10:
            return {
                "error": "ALAPI Token长度不足，请检查配置",
                "alapi_token": None,
                "custom_anime_api": custom_anime_api
            }

        # 验证自定义动漫API URL格式
        if custom_anime_api and not custom_anime_api.startswith(('http://', 'https://')):
            return {
                "error": "自定义动漫API URL格式不正确，请确保以http://或https://开头",
                "alapi_token": alapi_token,
                "custom_anime_api": None
            }

        configs["alapi_token"] = alapi_token
        configs["custom_anime_api"] = custom_anime_api

        return configs

    async def run(self, event: AstrMessageEvent, keyword: str):
        """
        搜索动漫信息
        优先使用自定义API，回退到Bangumi公共API
        """
        # 生成缓存键
        cache_key = self._get_cache_key("anime_info", keyword.lower())
        
        # 检查缓存
        cached_data = self._get_cached_data(cache_key)
        if cached_data:
            logger.info(f"AnimeInfoTool: 使用缓存数据，关键词: {keyword}")
            return cached_data
        
        # 检查请求频率
        request_key = f"request_{cache_key}"
        if not self._can_make_request(request_key):
            return {
                "error": f"请求过于频繁，请稍后再试",
                "keyword": keyword
            }
        
        self._update_request_time(request_key)
        
        # 验证配置
        configs = await self.validate_configs(event.context)
        if "error" in configs:
            return {"error": configs["error"]}

        custom_anime_api = configs.get("custom_anime_api", "")

        try:
            # 双模式逻辑：优先使用自定义API，回退到Bangumi API
            if custom_anime_api:
                # 使用自定义动漫API
                result = await self._search_with_custom_api(custom_anime_api, keyword)
            else:
                # 使用Bangumi公共API
                result = await self._search_with_bangumi_api(keyword)

            # 只有在成功获取数据时才缓存
            if result and "error" not in result:
                self._set_cache(cache_key, result)
            
            return result

        except Exception as e:
            return {
                "error": f"搜索动漫信息时发生错误: {str(e)}"
            }

    async def _search_with_custom_api(self, api_url: str, keyword: str):
        """
        使用自定义动漫API搜索
        """
        try:
            # 使用较长的超时时间，防止响应过慢
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    api_url,
                    params={"keyword": keyword},
                    headers={"User-Agent": "AstrBot-TrendingAnime-Plugin/1.0"}
                )

                if response.status_code != 200:
                    return {
                        "error": f"自定义API请求失败，状态码: {response.status_code}"
                    }

                data = response.json()

                # 假设自定义API返回格式与Bangumi类似，进行相应处理
                # 这里可以根据实际API格式调整
                animes = []

                # 检查返回数据格式并适配
                if isinstance(data, dict) and "data" in data:
                    raw_animes = data["data"]
                elif isinstance(data, list):
                    raw_animes = data
                else:
                    raw_animes = [data] if data else []

                # 限制返回前5个结果
                max_results = min(len(raw_animes), 5)

                for i in range(max_results):
                    raw_anime = raw_animes[i]

                    if not isinstance(raw_anime, dict):
                        continue

                    # 提取动漫信息
                    anime_info = {
                        "chinese_name": self.sanitize_text(
                            raw_anime.get("chinese_name") or
                            raw_anime.get("name_cn") or
                            raw_anime.get("name") or
                            f"未知动漫{i+1}"
                        ),
                        "original_name": self.sanitize_text(
                            raw_anime.get("original_name") or
                            raw_anime.get("name") or
                            ""
                        ),
                        "air_date": raw_anime.get("air_date") or raw_anime.get("date") or "未知",
                        "episodes": raw_anime.get("episodes") or raw_anime.get("eps") or "未知",
                        "rating": raw_anime.get("rating") or raw_anime.get("score") or "无评分",
                        "summary": self.sanitize_text(
                            raw_anime.get("summary") or
                            raw_anime.get("info") or
                            raw_anime.get("desc") or
                            "暂无简介"
                        )
                    }

                    animes.append(anime_info)

                return {
                    "source": "custom_api",
                    "keyword": keyword,
                    "count": len(animes),
                    "animes": animes
                }

        except httpx.TimeoutException:
            return {"error": "自定义API请求超时"}
        except httpx.RequestError as e:
            return {"error": f"自定义API请求错误: {str(e)}"}
        except json.JSONDecodeError:
            return {"error": "自定义API返回数据格式错误"}
        except Exception as e:
            return {"error": f"自定义API调用错误: {str(e)}"}

    async def _search_with_bangumi_api(self, keyword: str):
        """
        使用Bangumi公共API搜索动漫信息
        """
        try:
            # Bangumi API 搜索端点
            search_url = "https://api.bgm.tv/search/subject"

            # 设置请求头，遵守API使用规范
            headers = {
                "User-Agent": "AstrBot-TrendingAnime-Plugin/1.0 (contact: your-email@example.com)",
                "Accept": "application/json",
                "Content-Type": "application/json"
            }

            # 使用较长的超时时间，防止响应过慢
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    search_url,
                    params={
                        "type": 2,  # 2表示动画
                        "responseGroup": "large",  # 获取详细信息
                        "keyword": keyword
                    },
                    headers=headers
                )

                if response.status_code == 404:
                    return {
                        "source": "bangumi",
                        "keyword": keyword,
                        "count": 0,
                        "animes": [],
                        "message": "未找到相关动漫"
                    }

                if response.status_code != 200:
                    return {
                        "error": f"Bangumi API请求失败，状态码: {response.status_code}"
                    }

                data = response.json()

                # 检查是否有结果
                if not data.get("list"):
                    return {
                        "source": "bangumi",
                        "keyword": keyword,
                        "count": 0,
                        "animes": [],
                        "message": "未找到相关动漫"
                    }

                animes = []
                raw_animes = data["list"]

                # 限制返回前5个结果
                max_results = min(len(raw_animes), 5)

                for i in range(max_results):
                    raw_anime = raw_animes[i]

                    # 提取动漫信息
                    rating_info = raw_anime.get("rating", {})
                    score = rating_info.get("score", "无评分") if rating_info else "无评分"

                    anime_info = {
                        "chinese_name": self.sanitize_text(
                            raw_anime.get("name_cn") or
                            raw_anime.get("name") or
                            f"未知动漫{i+1}"
                        ),
                        "original_name": self.sanitize_text(raw_anime.get("name", "")),
                        "air_date": raw_anime.get("air_date") or "未知",
                        "episodes": raw_anime.get("eps") or "未知",
                        "rating": f"{score}/10" if score != "无评分" else "无评分",
                        "summary": self.sanitize_text(
                            raw_anime.get("summary") or
                            "暂无简介"
                        )
                    }

                    animes.append(anime_info)

                return {
                    "source": "bangumi",
                    "keyword": keyword,
                    "count": len(animes),
                    "animes": animes
                }

        except httpx.TimeoutException:
            return {"error": "Bangumi API请求超时"}
        except httpx.RequestError as e:
            return {"error": f"Bangumi API请求错误: {str(e)}"}
        except json.JSONDecodeError:
            return {"error": "Bangumi API返回数据格式错误"}
        except Exception as e:
            return {"error": f"Bangumi API调用错误: {str(e)}"}