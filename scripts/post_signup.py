#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
가입 완료 후 실행되는 파이썬 스크립트
네이버 링크가 저장된 후 특정 처리를 수행합니다.
"""

import argparse
import sys
import os
import json
import logging
from datetime import datetime
from urllib.parse import urlparse
import requests
from typing import Dict, Any, Optional

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('post_signup.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class PostSignupProcessor:
    """가입 후처리 클래스"""
    
    def __init__(self, store_id: int, store_name: str, business_number: str, naver_url: str):
        self.store_id = store_id
        self.store_name = store_name
        self.business_number = business_number
        self.naver_url = naver_url
        self.processed_at = datetime.now()
        
    def validate_naver_url(self) -> bool:
        """네이버 URL 유효성 검사"""
        if not self.naver_url:
            logger.warning(f"매장 {self.store_id}: 네이버 URL이 없습니다.")
            return False
            
        try:
            parsed = urlparse(self.naver_url)
            if 'naver.com' not in parsed.netloc:
                logger.warning(f"매장 {self.store_id}: 유효하지 않은 네이버 URL: {self.naver_url}")
                return False
            return True
        except Exception as e:
            logger.error(f"매장 {self.store_id}: URL 파싱 오류: {e}")
            return False
    
    def extract_store_info_from_naver(self) -> Optional[Dict[str, Any]]:
        """네이버에서 매장 정보 추출"""
        try:
            logger.info(f"매장 {self.store_id}: 네이버에서 매장 정보 추출 시작")
            
            # 여기에 실제 네이버 스크래핑 로직을 구현
            # 예시: requests를 사용한 기본적인 정보 수집
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            response = requests.get(self.naver_url, headers=headers, timeout=10)
            response.raise_for_status()
            
            # 실제 구현에서는 BeautifulSoup 등을 사용하여 HTML 파싱
            # 여기서는 예시로 기본 정보만 반환
            store_info = {
                'url': self.naver_url,
                'scraped_at': self.processed_at.isoformat(),
                'status': 'success'
            }
            
            logger.info(f"매장 {self.store_id}: 네이버 정보 추출 완료")
            return store_info
            
        except Exception as e:
            logger.error(f"매장 {self.store_id}: 네이버 정보 추출 실패: {e}")
            return None
    
    def process_business_data(self) -> Dict[str, Any]:
        """사업자 정보 처리"""
        try:
            logger.info(f"매장 {self.store_id}: 사업자 정보 처리 시작")
            
            # 사업자등록번호 정리 (하이픈 제거)
            clean_business_number = self.business_number.replace('-', '')
            
            # 사업자 정보 검증 및 추가 처리
            business_data = {
                'store_id': self.store_id,
                'store_name': self.store_name,
                'business_number': clean_business_number,
                'business_number_formatted': f"{clean_business_number[:3]}-{clean_business_number[3:5]}-{clean_business_number[5:]}",
                'processed_at': self.processed_at.isoformat()
            }
            
            logger.info(f"매장 {self.store_id}: 사업자 정보 처리 완료")
            return business_data
            
        except Exception as e:
            logger.error(f"매장 {self.store_id}: 사업자 정보 처리 실패: {e}")
            return {}
    
    def generate_report(self, store_info: Optional[Dict], business_data: Dict) -> Dict[str, Any]:
        """처리 결과 리포트 생성"""
        report = {
            'store_id': self.store_id,
            'store_name': self.store_name,
            'processing_time': datetime.now().isoformat(),
            'naver_url_processed': bool(store_info),
            'business_data_processed': bool(business_data),
            'status': 'completed'
        }
        
        if store_info:
            report['naver_info'] = store_info
            
        if business_data:
            report['business_info'] = business_data
            
        return report
    
    def save_to_file(self, data: Dict[str, Any], filename: str):
        """결과를 파일로 저장"""
        try:
            output_dir = 'output'
            os.makedirs(output_dir, exist_ok=True)
            
            filepath = os.path.join(output_dir, filename)
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                
            logger.info(f"매장 {self.store_id}: 결과 저장 완료 - {filepath}")
            
        except Exception as e:
            logger.error(f"매장 {self.store_id}: 파일 저장 실패: {e}")
    
    def run(self) -> Dict[str, Any]:
        """메인 처리 로직"""
        logger.info(f"매장 {self.store_id} ({self.store_name}) 후처리 시작")
        
        try:
            # 1. 네이버 URL 유효성 검사
            if not self.validate_naver_url():
                logger.warning(f"매장 {self.store_id}: 네이버 URL 검증 실패")
            
            # 2. 네이버에서 매장 정보 추출
            store_info = None
            if self.validate_naver_url():
                store_info = self.extract_store_info_from_naver()
            
            # 3. 사업자 정보 처리
            business_data = self.process_business_data()
            
            # 4. 리포트 생성
            report = self.generate_report(store_info, business_data)
            
            # 5. 결과 저장
            filename = f"store_{self.store_id}_{self.processed_at.strftime('%Y%m%d_%H%M%S')}.json"
            self.save_to_file(report, filename)
            
            logger.info(f"매장 {self.store_id}: 후처리 완료")
            return report
            
        except Exception as e:
            logger.error(f"매장 {self.store_id}: 후처리 중 오류 발생: {e}")
            return {
                'store_id': self.store_id,
                'status': 'error',
                'error': str(e),
                'processing_time': datetime.now().isoformat()
            }

def main():
    """메인 함수"""
    parser = argparse.ArgumentParser(description='가입 후처리 스크립트')
    parser.add_argument('--store_id', required=True, type=int, help='매장 ID')
    parser.add_argument('--store_name', required=True, help='매장명')
    parser.add_argument('--business_number', required=True, help='사업자등록번호')
    parser.add_argument('--naver_url', default='', help='네이버 가게 URL')
    
    args = parser.parse_args()
    
    try:
        # 후처리 실행
        processor = PostSignupProcessor(
            store_id=args.store_id,
            store_name=args.store_name,
            business_number=args.business_number,
            naver_url=args.naver_url
        )
        
        result = processor.run()
        
        # 결과 출력 (Node.js에서 캡처됨)
        print(json.dumps(result, ensure_ascii=False))
        
        # 성공 시 종료 코드 0
        sys.exit(0)
        
    except Exception as e:
        logger.error(f"스크립트 실행 오류: {e}")
        error_result = {
            'status': 'error',
            'error': str(e),
            'store_id': getattr(args, 'store_id', 'unknown')
        }
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(1)

if __name__ == '__main__':
    main()
