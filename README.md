# 🍽️ Burnana MVP

AI 기반 스마트 테이블 오더 서비스

## 🚀 빠른 시작

### 개발 환경 실행
```bash
# 개발 모드 실행
docker-compose -f docker-compose.dev.yml up --build

# 백그라운드 실행
docker-compose -f docker-compose.dev.yml up -d
```

### 접속 URL
- 🏠 메인: http://localhost:3000
- 📱 고객 주문: http://localhost:3000/order?table=1&token=valid_token
- 📊 점주 대시보드: http://localhost:3000/dashboard
- 🔄 QR 생성: http://localhost:3000/api/table/qr/1

## 🏗️ 아키텍처

- **백엔드**: Node.js + Express + Socket.IO
- **AI**: Ollama LLM (Tool Calling 지원)
- **데이터베이스**: PostgreSQL + Redis
- **프론트엔드**: Vanilla JavaScript (모바일 최적화)

## 📁 주요 폴더

- `server/` - 백엔드 API 서버
- `client/mobile/` - 고객용 모바일 주문 페이지  
- `client/dashboard/` - 점주용 관리 대시보드
- `docker/` - Docker 설정 파일들

## 🔧 개발 명령어

```bash
# 로그 확인
docker-compose -f docker-compose.dev.yml logs -f

# 컨테이너 내부 접속
docker-compose -f docker-compose.dev.yml exec table-order-app sh

# 개발 환경 중단
docker-compose -f docker-compose.dev.yml down
```
