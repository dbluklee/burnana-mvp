# 🍽️ Burnana MVP

AI 기반 스마트 테이블 오더 서비스

## ✨ 주요 기능

- 🤖 AI 기반 주문 처리
- 📱 모바일 최적화 주문 인터페이스
- 📊 실시간 대시보드
- 🔄 QR 코드 기반 테이블 연결
- 🕷️ 네이버 메뉴 자동 스크래핑
- 🐍 Python 후처리 스크립트 자동 실행

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
- 🐍 Python API: http://localhost:8000

## 🏗️ 아키텍처

- **백엔드**: Node.js + Express + Socket.IO
- **AI**: Ollama LLM (Tool Calling 지원)
- **데이터베이스**: PostgreSQL + Redis
- **프론트엔드**: Vanilla JavaScript (모바일 최적화)
- **후처리**: Python Flask 서버 (가입 완료 후 자동 실행)

## 📁 주요 폴더

- `server/` - 백엔드 API 서버
- `client/mobile/` - 고객용 모바일 주문 페이지  
- `client/dashboard/` - 점주용 관리 대시보드
- `scripts/` - Python 후처리 스크립트
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

## 🐍 Python 후처리 서비스

가입 완료 시 네이버 링크가 저장되면 자동으로 Python Flask 서버가 스크립트를 실행합니다.

### Docker 서비스 구성
- **Python 서버**: Flask 기반 HTTP API (포트 8000)
- **비동기 처리**: 작업 큐를 통한 백그라운드 실행
- **상태 모니터링**: 작업 진행 상황 실시간 확인

### API 엔드포인트
- `GET /health` - 서버 상태 확인
- `POST /run-script` - 스크립트 실행 요청
- `GET /task-status/<task_id>` - 작업 상태 조회
- `GET /tasks` - 완료된 작업 목록
- `POST /clear-tasks` - 작업 결과 정리

### 로그 확인
```bash
# Python 서버 로그
docker-compose -f docker-compose.dev.yml logs -f python-processor

# 작업 결과 확인
docker-compose -f docker-compose.dev.yml exec python-processor ls -la /app/scripts/output/
```
