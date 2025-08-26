#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
네이버 가게 ID를 이용한 메뉴 스크래핑 시스템
"""

import os
import sys
import json
import logging
import argparse
import asyncio
import aiohttp
import psycopg2
import pandas as pd
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse
import re
from bs4 import BeautifulSoup
import time
import random

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('naver_menu_scraper.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class MenuItem:
    """메뉴 아이템 데이터 클래스"""
    name: str
    price: Optional[int]
    description: Optional[str]
    category: Optional[str]
    image_url: Optional[str]
    rating: Optional[float]
    review_count: Optional[int]
    is_popular: bool = False
    is_signature: bool = False
    naver_menu_id: Optional[str] = None

class NaverMenuScraper:
    """네이버 메뉴 스크래핑 클래스"""
    
    def __init__(self, db_config: Dict[str, str]):
        self.db_config = db_config
        self.session = None
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
        
    async def __aenter__(self):
        """비동기 컨텍스트 매니저 진입"""
        self.session = aiohttp.ClientSession(headers=self.headers)
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """비동기 컨텍스트 매니저 종료"""
        if self.session:
            await self.session.close()
    
    def get_db_connection(self):
        """데이터베이스 연결"""
        return psycopg2.connect(**self.db_config)
    
    async def scrape_menu(self, naver_store_id: str, store_id: int) -> List[MenuItem]:
        """네이버 가게 ID로 메뉴 정보 스크래핑"""
        try:
            logger.info(f"🍽️ [매장 {store_id}] 메뉴 스크래핑 시작 - 네이버 ID: {naver_store_id}")
            
            # 스크래핑 로그 시작
            log_id = self.start_scraping_log(store_id, naver_store_id)
            
            # 네이버 메뉴 URL 생성 (모바일 플레이스)
            url = f"https://m.place.naver.com/restaurant/{naver_store_id}/menu/list"
            
            # 페이지 요청
            async with self.session.get(url, timeout=30) as response:
                if response.status != 200:
                    raise Exception(f"HTTP {response.status}: {response.reason}")
                
                html = await response.text()
                

                
            # 메뉴 정보 파싱
            menus = self.parse_menu_from_html(html, naver_store_id)
            
            # 데이터베이스에 저장
            saved_count = self.save_menus_to_db(store_id, naver_store_id, menus)
            
            # 통계 업데이트
            self.update_menu_stats(store_id, naver_store_id, menus)
            
            # 스크래핑 로그 완료
            self.complete_scraping_log(log_id, len(menus), True)
            
            logger.info(f"✅ [매장 {store_id}] 메뉴 스크래핑 완료 - {len(menus)}개 메뉴, {saved_count}개 저장")
            return menus
            
        except Exception as e:
            logger.error(f"❌ [매장 {store_id}] 메뉴 스크래핑 실패: {e}")
            self.complete_scraping_log(log_id, 0, False, str(e))
            return []
    
    def parse_menu_from_html(self, html: str, naver_store_id: str) -> List[MenuItem]:
        """HTML에서 메뉴 정보 파싱 (모바일 네이버 플레이스)"""
        menus = []
        soup = BeautifulSoup(html, 'html.parser')
        
        try:
            # 모바일 네이버 플레이스 메뉴 패턴 파싱
            # CSS 선택자: li.E2jtL (메뉴 항목)
            menu_items = soup.find_all('li', class_='E2jtL')
            
            if not menu_items:
                # 다른 패턴 시도
                menu_items = soup.find_all(['li', 'div'], string=re.compile(r'.*_.*_원.*'))
            
            for item in menu_items:
                menu = self.extract_menu_item_mobile(item)
                if menu:
                    menu.naver_menu_id = f"{naver_store_id}_{len(menus)}"
                    menus.append(menu)
            
            # 메뉴가 없으면 텍스트 기반 파싱 시도
            if not menus:
                menus = self.parse_menu_from_text(html, naver_store_id)
            
            # 메뉴가 없으면 텍스트 기반 파싱 시도
            if not menus:
                menus = self.parse_menu_from_text(html, naver_store_id)
            
            # 메뉴가 없으면 다른 패턴 시도
            if not menus:
                menus = self.parse_menu_alternative(html, naver_store_id)
            
            logger.info(f"📋 메뉴 파싱 완료: {len(menus)}개 메뉴 발견")
            return menus
            
        except Exception as e:
            logger.error(f"❌ 메뉴 파싱 오류: {e}")
            return []
    
    def extract_menu_item_mobile(self, item_element) -> Optional[MenuItem]:
        """모바일 네이버 플레이스 메뉴 아이템 요소에서 정보 추출"""
        try:
            menu_name, menu_desc, menu_price, menu_recommendation = "", "", "", ""

            # --- 메뉴 이름(span.lPzHi) 수집 ---
            name_elements = item_element.find_all('span', class_='lPzHi')
            if name_elements:
                menu_name = name_elements[0].get_text(strip=True)

            # --- 메뉴 설명(div.kPogF) 수집 ---
            desc_elements = item_element.find_all('div', class_='kPogF')
            if desc_elements:
                menu_desc = desc_elements[0].get_text(strip=True)

            # --- 추천 여부(span.QM_zp span) 수집 ---
            recommendation_elements = item_element.find_all('span', class_='QM_zp')
            if recommendation_elements:
                span_elements = recommendation_elements[0].find_all('span')
                if span_elements:
                    menu_recommendation = span_elements[0].get_text(strip=True)

            # --- 메뉴 가격(div.GXS1X) 수집 ---
            # ⭐ em 태그가 있는 경우와 없는 경우 모두 처리
            price_em_elements = item_element.find_all('div', class_='GXS1X')
            if price_em_elements:
                em_elements = price_em_elements[0].find_all('em')
                if em_elements:
                    # em 태그가 있으면 그 안의 텍스트를 가격으로
                    menu_price = em_elements[0].get_text(strip=True)
                else:
                    # em 태그가 없으면 div.GXS1X의 텍스트를 가격으로
                    menu_price = price_em_elements[0].get_text(strip=True)
            
            # 가격에서 숫자만 추출
            if menu_price:
                price_match = re.search(r'(\d{1,3}(?:,\d{3})*)', menu_price)
                if price_match:
                    menu_price = int(price_match.group(1).replace(',', ''))
                else:
                    menu_price = None
            
            # 수집한 정보가 하나라도 있을 경우에만 메뉴 생성
            if menu_name or menu_desc or menu_price or menu_recommendation:
                return MenuItem(
                    name=menu_name,
                    price=menu_price,
                    description=menu_desc,
                    category=None,
                    image_url=None,
                    rating=None,
                    review_count=0,
                    is_popular=bool(menu_recommendation),
                    is_signature=False
                )
            
            return None
            
        except Exception as e:
            logger.error(f"❌ 모바일 메뉴 아이템 추출 오류: {e}")
            return None
    
    def extract_menu_item(self, item_element) -> Optional[MenuItem]:
        """일반 메뉴 아이템 요소에서 정보 추출"""
        try:
            # 메뉴명 추출
            name_elem = item_element.find(['h3', 'h4', 'span', 'div'], 
                                        class_=re.compile(r'name|title|Name|Title'))
            if not name_elem:
                name_elem = item_element.find(['h3', 'h4', 'span', 'div'])
            
            if not name_elem or not name_elem.get_text(strip=True):
                return None
                
            name = name_elem.get_text(strip=True)
            
            # 가격 추출
            price_elem = item_element.find(['span', 'div'], 
                                         class_=re.compile(r'price|Price|cost|Cost'))
            price = None
            if price_elem:
                price_text = price_elem.get_text(strip=True)
                price_match = re.search(r'(\d{1,3}(?:,\d{3})*)', price_text)
                if price_match:
                    price = int(price_match.group(1).replace(',', ''))
            
            # 설명 추출
            desc_elem = item_element.find(['p', 'span', 'div'], 
                                        class_=re.compile(r'desc|description|Desc|Description'))
            description = desc_elem.get_text(strip=True) if desc_elem else None
            
            # 이미지 URL 추출
            img_elem = item_element.find('img')
            image_url = img_elem.get('src') if img_elem else None
            if image_url and not image_url.startswith('http'):
                image_url = urljoin('https://m.place.naver.com', image_url)
            
            # 평점 추출
            rating_elem = item_element.find(['span', 'div'], 
                                          class_=re.compile(r'rating|Rating|score|Score'))
            rating = None
            if rating_elem:
                rating_text = rating_elem.get_text(strip=True)
                rating_match = re.search(r'(\d+\.?\d*)', rating_text)
                if rating_match:
                    rating = float(rating_match.group(1))
            
            # 인기/시그니처 메뉴 확인
            is_popular = bool(item_element.find(['span', 'div'], 
                                              class_=re.compile(r'popular|Popular|best|Best')))
            is_signature = bool(item_element.find(['span', 'div'], 
                                                class_=re.compile(r'signature|Signature|recommend|Recommend')))
            
            return MenuItem(
                name=name,
                price=price,
                description=description,
                category=None,  # 카테고리는 별도로 분류 필요
                image_url=image_url,
                rating=rating,
                review_count=0,
                is_popular=is_popular,
                is_signature=is_signature
            )
            
        except Exception as e:
            logger.error(f"❌ 메뉴 아이템 추출 오류: {e}")
            return None
    
    def parse_menu_from_text(self, html: str, naver_store_id: str) -> List[MenuItem]:
        """텍스트 기반 메뉴 파싱 (모바일 네이버 플레이스)"""
        menus = []
        
        try:
            # HTML에서 텍스트 추출
            soup = BeautifulSoup(html, 'html.parser')
            text_content = soup.get_text()
            
            # 모바일 네이버 플레이스 메뉴 패턴 찾기
            # "메뉴명_가격_원설명" 패턴
            menu_pattern = r'([^_\n]+)_(\d{1,3}(?:,\d{3})*)_원([^_\n]*)'
            matches = re.findall(menu_pattern, text_content)
            
            for i, match in enumerate(matches):
                name = match[0].strip()
                price = int(match[1].replace(',', ''))
                description = match[2].strip()
                
                # 중복 제거
                if not any(menu.name == name for menu in menus):
                    menu = MenuItem(
                        name=name,
                        price=price,
                        description=description,
                        category=None,
                        image_url=None,
                        rating=None,
                        review_count=0,
                        is_popular=False,
                        is_signature=False,
                        naver_menu_id=f"{naver_store_id}_{i}"
                    )
                    menus.append(menu)
            
            logger.info(f"📋 텍스트 기반 메뉴 파싱: {len(menus)}개 메뉴 발견")
            return menus
            
        except Exception as e:
            logger.error(f"❌ 텍스트 기반 메뉴 파싱 오류: {e}")
            return []
    
    def parse_menu_alternative(self, html: str, naver_store_id: str) -> List[MenuItem]:
        """대체 메뉴 파싱 방법"""
        menus = []
        soup = BeautifulSoup(html, 'html.parser')
        
        try:
            # JSON 데이터에서 메뉴 정보 찾기
            scripts = soup.find_all('script')
            for script in scripts:
                if script.string and 'menu' in script.string.lower():
                    # JSON 데이터 파싱 시도
                    json_data = self.extract_json_from_script(script.string)
                    if json_data:
                        menus.extend(self.parse_menu_from_json(json_data, naver_store_id))
            
            # 메뉴가 없으면 기본 정보만 생성
            if not menus:
                store_name = soup.find('h1', class_=re.compile(r'title|Title'))
                if store_name:
                    menus.append(MenuItem(
                        name=f"{store_name.get_text(strip=True)} 기본 메뉴",
                        price=None,
                        description="메뉴 정보를 자동으로 가져올 수 없습니다.",
                        category="기타",
                        image_url=None,
                        rating=None,
                        review_count=0,
                        is_popular=False,
                        is_signature=False,
                        naver_menu_id=f"{naver_store_id}_default"
                    ))
            
        except Exception as e:
            logger.error(f"❌ 대체 메뉴 파싱 오류: {e}")
        
        return menus
    
    def extract_json_from_script(self, script_content: str) -> Optional[Dict]:
        """스크립트에서 JSON 데이터 추출"""
        try:
            # JSON 패턴 찾기
            json_patterns = [
                r'window\.__INITIAL_STATE__\s*=\s*({.*?});',
                r'window\.__NEXT_DATA__\s*=\s*({.*?});',
                r'"menu":\s*(\[.*?\])',
                r'"menus":\s*(\[.*?\])'
            ]
            
            for pattern in json_patterns:
                match = re.search(pattern, script_content, re.DOTALL)
                if match:
                    return json.loads(match.group(1))
            
            return None
            
        except Exception as e:
            logger.error(f"❌ JSON 추출 오류: {e}")
            return None
    
    def parse_menu_from_json(self, json_data: Dict, naver_store_id: str) -> List[MenuItem]:
        """JSON 데이터에서 메뉴 파싱"""
        menus = []
        
        try:
            # 다양한 JSON 구조 지원
            menu_data = (
                json_data.get('menu') or 
                json_data.get('menus') or 
                json_data.get('items') or 
                json_data.get('products') or
                []
            )
            
            if isinstance(menu_data, list):
                for i, item in enumerate(menu_data):
                    if isinstance(item, dict):
                        menu = MenuItem(
                            name=item.get('name', item.get('title', f'메뉴 {i+1}')),
                            price=item.get('price'),
                            description=item.get('description', item.get('desc')),
                            category=item.get('category'),
                            image_url=item.get('image', item.get('imageUrl')),
                            rating=item.get('rating'),
                            review_count=item.get('reviewCount', 0),
                            is_popular=item.get('isPopular', False),
                            is_signature=item.get('isSignature', False),
                            naver_menu_id=f"{naver_store_id}_{i}"
                        )
                        menus.append(menu)
            
        except Exception as e:
            logger.error(f"❌ JSON 메뉴 파싱 오류: {e}")
        
        return menus
    
    def start_scraping_log(self, store_id: int, naver_store_id: str) -> int:
        """스크래핑 로그 시작"""
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO naver_scraping_logs 
                (store_id, naver_store_id, scraping_type, status, started_at)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
            """, (store_id, naver_store_id, 'menu', 'pending', datetime.now()))
            
            log_id = cursor.fetchone()[0]
            conn.commit()
            cursor.close()
            conn.close()
            
            return log_id
            
        except Exception as e:
            logger.error(f"❌ 스크래핑 로그 시작 오류: {e}")
            return 0
    
    def complete_scraping_log(self, log_id: int, menu_count: int, success: bool, error_message: str = None):
        """스크래핑 로그 완료"""
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                UPDATE naver_scraping_logs 
                SET status = %s, menu_count = %s, completed_at = %s, 
                    processing_time_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
                    error_message = %s
                WHERE id = %s
            """, ('success' if success else 'failed', menu_count, datetime.now(), error_message, log_id))
            
            conn.commit()
            cursor.close()
            conn.close()
            
        except Exception as e:
            logger.error(f"❌ 스크래핑 로그 완료 오류: {e}")
    
    def save_menus_to_db(self, store_id: int, naver_store_id: str, menus: List[MenuItem]) -> int:
        """메뉴 정보를 데이터베이스에 저장"""
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            
            saved_count = 0
            for menu in menus:
                try:
                    cursor.execute("""
                        INSERT INTO naver_menus 
                        (store_id, naver_store_id, menu_name, menu_price, menu_description, 
                         menu_category, menu_image_url, menu_rating, menu_review_count,
                         is_popular, is_signature, naver_menu_id, scraped_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (store_id, naver_store_id, menu_name) 
                        DO UPDATE SET
                            menu_price = EXCLUDED.menu_price,
                            menu_description = EXCLUDED.menu_description,
                            menu_category = EXCLUDED.menu_category,
                            menu_image_url = EXCLUDED.menu_image_url,
                            menu_rating = EXCLUDED.menu_rating,
                            menu_review_count = EXCLUDED.menu_review_count,
                            is_popular = EXCLUDED.is_popular,
                            is_signature = EXCLUDED.is_signature,
                            updated_at = NOW()
                    """, (
                        store_id, naver_store_id, menu.name, menu.price, menu.description,
                        menu.category, menu.image_url, menu.rating, menu.review_count,
                        menu.is_popular, menu.is_signature, menu.naver_menu_id, datetime.now()
                    ))
                    saved_count += 1
                    
                except Exception as e:
                    logger.error(f"❌ 메뉴 저장 오류 ({menu.name}): {e}")
            
            conn.commit()
            cursor.close()
            conn.close()
            
            logger.info(f"💾 {saved_count}개 메뉴 저장 완료")
            return saved_count
            
        except Exception as e:
            logger.error(f"❌ 메뉴 저장 오류: {e}")
            return 0
    
    def update_menu_stats(self, store_id: int, naver_store_id: str, menus: List[MenuItem]):
        """메뉴 통계 업데이트"""
        try:
            if not menus:
                return
                
            conn = self.get_db_connection()
            cursor = conn.cursor()
            
            # 통계 계산
            prices = [menu.price for menu in menus if menu.price]
            avg_price = sum(prices) / len(prices) if prices else None
            min_price = min(prices) if prices else None
            max_price = max(prices) if prices else None
            popular_count = sum(1 for menu in menus if menu.is_popular)
            signature_count = sum(1 for menu in menus if menu.is_signature)
            
            cursor.execute("""
                INSERT INTO naver_menu_stats 
                (store_id, naver_store_id, total_menus, avg_price, min_price, max_price,
                 popular_menu_count, signature_menu_count, last_scraped_at, scraped_success)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (store_id, naver_store_id) 
                DO UPDATE SET
                    total_menus = EXCLUDED.total_menus,
                    avg_price = EXCLUDED.avg_price,
                    min_price = EXCLUDED.min_price,
                    max_price = EXCLUDED.max_price,
                    popular_menu_count = EXCLUDED.popular_menu_count,
                    signature_menu_count = EXCLUDED.signature_menu_count,
                    last_scraped_at = EXCLUDED.last_scraped_at,
                    scraped_success = EXCLUDED.scraped_success,
                    error_message = NULL
            """, (
                store_id, naver_store_id, len(menus), avg_price, min_price, max_price,
                popular_count, signature_count, datetime.now(), True
            ))
            
            conn.commit()
            cursor.close()
            conn.close()
            
            logger.info(f"📊 메뉴 통계 업데이트 완료: {len(menus)}개 메뉴")
            
        except Exception as e:
            logger.error(f"❌ 메뉴 통계 업데이트 오류: {e}")

async def main():
    """메인 함수"""
    parser = argparse.ArgumentParser(description='네이버 메뉴 스크래핑')
    parser.add_argument('--store_id', required=True, type=int, help='매장 ID')
    parser.add_argument('--naver_store_id', required=True, help='네이버 가게 ID')
    parser.add_argument('--db_host', default='localhost', help='데이터베이스 호스트')
    parser.add_argument('--db_port', default='5432', help='데이터베이스 포트')
    parser.add_argument('--db_name', default='burnana_dev', help='데이터베이스 이름')
    parser.add_argument('--db_user', default='dev_user', help='데이터베이스 사용자')
    parser.add_argument('--db_pass', default='dev_password', help='데이터베이스 비밀번호')
    
    args = parser.parse_args()
    
    # 데이터베이스 설정
    db_config = {
        'host': args.db_host,
        'port': args.db_port,
        'database': args.db_name,
        'user': args.db_user,
        'password': args.db_pass
    }
    
    try:
        async with NaverMenuScraper(db_config) as scraper:
            menus = await scraper.scrape_menu(args.naver_store_id, args.store_id)
            
            # 결과 출력
            result = {
                'store_id': args.store_id,
                'naver_store_id': args.naver_store_id,
                'menu_count': len(menus),
                'menus': [
                    {
                        'name': menu.name,
                        'price': menu.price,
                        'description': menu.description,
                        'category': menu.category,
                        'is_popular': menu.is_popular,
                        'is_signature': menu.is_signature
                    }
                    for menu in menus
                ],
                'scraped_at': datetime.now().isoformat()
            }
            
            print(json.dumps(result, ensure_ascii=False, indent=2))
            
    except Exception as e:
        logger.error(f"❌ 스크래핑 실패: {e}")
        sys.exit(1)

if __name__ == '__main__':
    asyncio.run(main())
