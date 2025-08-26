-- database/migrations/002_add_naver_store_id.sql
-- stores 테이블에 네이버 가게 ID 필드 추가

-- 1. stores 테이블에 naver_store_id 컬럼 추가
ALTER TABLE stores 
ADD COLUMN IF NOT EXISTS naver_store_id VARCHAR(20);

-- 2. naver_store_id에 대한 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_stores_naver_store_id ON stores(naver_store_id);

-- 3. 기존 데이터에 대한 naver_store_id 업데이트 (예시)
-- 실제 구현에서는 네이버 링크를 파싱하여 ID를 추출해야 함
UPDATE stores 
SET naver_store_id = '1054849411' 
WHERE naver_store_url = 'https://naver.me/FvExPxZs' 
AND naver_store_id IS NULL;
