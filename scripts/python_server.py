#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Python 스크립트 실행을 위한 HTTP API 서버
"""

import os
import sys
import json
import logging
import subprocess
import asyncio
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
import threading
import queue

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('python_server.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # CORS 허용

# 작업 큐 (비동기 처리용)
task_queue = queue.Queue()
task_results = {}

class PythonScriptRunner:
    """Python 스크립트 실행 관리자"""
    
    def __init__(self):
        self.script_path = os.path.join(os.path.dirname(__file__), 'post_signup.py')
        self.output_dir = os.path.join(os.path.dirname(__file__), 'output')
        
        # 출력 디렉토리 생성
        os.makedirs(self.output_dir, exist_ok=True)
        
    def run_script(self, task_id: str, args: dict) -> dict:
        """스크립트 실행"""
        try:
            logger.info(f"작업 {task_id}: Python 스크립트 실행 시작")
            
            # 명령어 인자 구성
            cmd_args = [
                sys.executable,
                self.script_path,
                '--store_id', str(args['store_id']),
                '--store_name', args['store_name'],
                '--business_number', args['business_number'],
                '--naver_url', args.get('naver_url', '')
            ]
            
            logger.info(f"작업 {task_id}: 명령어 실행 - {' '.join(cmd_args)}")
            
            # 스크립트 실행
            result = subprocess.run(
                cmd_args,
                capture_output=True,
                text=True,
                timeout=60,  # 60초 타임아웃
                cwd=os.path.dirname(__file__)
            )
            
            if result.returncode == 0:
                # 성공 시 JSON 결과 파싱
                try:
                    output_data = json.loads(result.stdout)
                    logger.info(f"작업 {task_id}: 스크립트 실행 성공")
                    return {
                        'success': True,
                        'task_id': task_id,
                        'result': output_data,
                        'stdout': result.stdout,
                        'stderr': result.stderr,
                        'completed_at': datetime.now().isoformat()
                    }
                except json.JSONDecodeError:
                    logger.warning(f"작업 {task_id}: JSON 파싱 실패, stdout 반환")
                    return {
                        'success': True,
                        'task_id': task_id,
                        'result': {'raw_output': result.stdout},
                        'stdout': result.stdout,
                        'stderr': result.stderr,
                        'completed_at': datetime.now().isoformat()
                    }
            else:
                logger.error(f"작업 {task_id}: 스크립트 실행 실패 (코드: {result.returncode})")
                return {
                    'success': False,
                    'task_id': task_id,
                    'error': f"스크립트 실행 실패 (코드: {result.returncode})",
                    'stdout': result.stdout,
                    'stderr': result.stderr,
                    'completed_at': datetime.now().isoformat()
                }
                
        except subprocess.TimeoutExpired:
            logger.error(f"작업 {task_id}: 실행 시간 초과")
            return {
                'success': False,
                'task_id': task_id,
                'error': '실행 시간 초과',
                'completed_at': datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"작업 {task_id}: 실행 중 오류 - {e}")
            return {
                'success': False,
                'task_id': task_id,
                'error': str(e),
                'completed_at': datetime.now().isoformat()
            }

# 전역 실행기 인스턴스
script_runner = PythonScriptRunner()

# 메뉴 스크래핑 함수
async def scrape_naver_menu(store_id: int, naver_store_id: str):
    """네이버 메뉴 스크래핑 실행"""
    try:
        # 메뉴 스크래핑 스크립트 실행
        cmd_args = [
            sys.executable,
            'naver_menu_scraper.py',
            '--store_id', str(store_id),
            '--naver_store_id', naver_store_id,
            '--db_host', 'postgres',
            '--db_port', '5432',
            '--db_name', 'burnana_dev',
            '--db_user', 'dev_user',
            '--db_pass', 'dev_password'
        ]
        
        logger.info(f"🍽️ [메뉴 스크래핑] 시작 - 매장 {store_id}, 네이버 ID {naver_store_id}")
        
        result = subprocess.run(
            cmd_args,
            capture_output=True,
            text=True,
            timeout=120,  # 2분 타임아웃
            cwd=os.path.dirname(__file__)
        )
        
        if result.returncode == 0:
            try:
                output_data = json.loads(result.stdout)
                logger.info(f"🍽️ [메뉴 스크래핑] 완료 - {output_data.get('menu_count', 0)}개 메뉴")
                return {
                    'success': True,
                    'result': output_data
                }
            except json.JSONDecodeError:
                logger.warning(f"🍽️ [메뉴 스크래핑] JSON 파싱 실패")
                return {
                    'success': True,
                    'result': {'raw_output': result.stdout}
                }
        else:
            logger.error(f"🍽️ [메뉴 스크래핑] 실패 - 코드: {result.returncode}")
            return {
                'success': False,
                'error': f"스크래핑 실패 (코드: {result.returncode})",
                'stderr': result.stderr
            }
            
    except subprocess.TimeoutExpired:
        logger.error(f"🍽️ [메뉴 스크래핑] 시간 초과")
        return {
            'success': False,
            'error': '스크래핑 시간 초과'
        }
    except Exception as e:
        logger.error(f"🍽️ [메뉴 스크래핑] 오류: {e}")
        return {
            'success': False,
            'error': str(e)
        }

def process_task_queue():
    """작업 큐 처리 (백그라운드 스레드)"""
    while True:
        try:
            task_data = task_queue.get(timeout=1)
            task_id = task_data['task_id']
            args = task_data['args']
            
            logger.info(f"작업 {task_id}: 큐에서 처리 시작")
            
            # 스크립트 실행
            result = script_runner.run_script(task_id, args)
            
            # 결과 저장
            task_results[task_id] = result
            
            logger.info(f"작업 {task_id}: 처리 완료")
            
        except queue.Empty:
            continue
        except Exception as e:
            logger.error(f"작업 큐 처리 중 오류: {e}")

# 백그라운드 작업 처리 스레드 시작
task_thread = threading.Thread(target=process_task_queue, daemon=True)
task_thread.start()

@app.route('/health', methods=['GET'])
def health_check():
    """헬스체크 엔드포인트"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'service': 'python-processor'
    })

@app.route('/run-script', methods=['POST'])
def run_script():
    """스크립트 실행 API"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': '요청 데이터가 없습니다.'}), 400
        
        # 필수 필드 검증
        required_fields = ['store_id', 'store_name', 'business_number']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'필수 필드가 없습니다: {field}'}), 400
        
        # 작업 ID 생성
        task_id = f"task_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{data['store_id']}"
        
        # 작업을 큐에 추가
        task_queue.put({
            'task_id': task_id,
            'args': data
        })
        
        logger.info(f"작업 {task_id}: 큐에 추가됨")
        
        return jsonify({
            'success': True,
            'task_id': task_id,
            'message': '작업이 큐에 추가되었습니다.',
            'status': 'queued'
        })
        
    except Exception as e:
        logger.error(f"스크립트 실행 요청 처리 중 오류: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/task-status/<task_id>', methods=['GET'])
def get_task_status(task_id):
    """작업 상태 조회 API"""
    try:
        if task_id in task_results:
            result = task_results[task_id]
            return jsonify({
                'task_id': task_id,
                'status': 'completed',
                'result': result
            })
        else:
            # 큐에서 작업 확인
            queue_size = task_queue.qsize()
            return jsonify({
                'task_id': task_id,
                'status': 'processing',
                'queue_size': queue_size,
                'message': '작업이 처리 중입니다.'
            })
            
    except Exception as e:
        logger.error(f"작업 상태 조회 중 오류: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/tasks', methods=['GET'])
def list_tasks():
    """완료된 작업 목록 조회"""
    try:
        completed_tasks = []
        for task_id, result in task_results.items():
            completed_tasks.append({
                'task_id': task_id,
                'success': result.get('success', False),
                'completed_at': result.get('completed_at'),
                'store_id': result.get('result', {}).get('store_id')
            })
        
        return jsonify({
            'tasks': completed_tasks,
            'total': len(completed_tasks)
        })
        
    except Exception as e:
        logger.error(f"작업 목록 조회 중 오류: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/clear-tasks', methods=['POST'])
def clear_tasks():
    """완료된 작업 결과 정리"""
    try:
        count = len(task_results)
        task_results.clear()
        
        return jsonify({
            'success': True,
            'message': f'{count}개의 작업 결과가 정리되었습니다.'
        })
        
    except Exception as e:
        logger.error(f"작업 정리 중 오류: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/scrape-menu', methods=['POST'])
def scrape_menu():
    """네이버 메뉴 스크래핑 API"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': '요청 데이터가 없습니다.'}), 400
        
        # 필수 필드 검증
        required_fields = ['store_id', 'naver_store_id']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'필수 필드가 없습니다: {field}'}), 400
        
        store_id = data['store_id']
        naver_store_id = data['naver_store_id']
        
        # 작업 ID 생성
        task_id = f"menu_scrape_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{store_id}"
        
        # 비동기로 메뉴 스크래핑 실행
        def run_scraping():
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                result = loop.run_until_complete(scrape_naver_menu(store_id, naver_store_id))
                task_results[task_id] = result
                loop.close()
            except Exception as e:
                task_results[task_id] = {
                    'success': False,
                    'error': str(e)
                }
        
        # 백그라운드 스레드에서 실행
        thread = threading.Thread(target=run_scraping)
        thread.daemon = True
        thread.start()
        
        logger.info(f"🍽️ [메뉴 스크래핑] 작업 시작 - {task_id}")
        
        return jsonify({
            'success': True,
            'task_id': task_id,
            'message': '메뉴 스크래핑이 시작되었습니다.',
            'status': 'processing'
        })
        
    except Exception as e:
        logger.error(f"메뉴 스크래핑 요청 처리 중 오류: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/menu-stats', methods=['GET'])
def get_menu_stats():
    """메뉴 통계 조회 API"""
    try:
        store_id = request.args.get('store_id', type=int)
        naver_store_id = request.args.get('naver_store_id')
        
        if not store_id and not naver_store_id:
            return jsonify({'error': 'store_id 또는 naver_store_id가 필요합니다.'}), 400
        
        # 데이터베이스에서 메뉴 통계 조회
        import psycopg2
        
        conn = psycopg2.connect(
            host='postgres',
            port='5432',
            database='burnana_dev',
            user='dev_user',
            password='dev_password'
        )
        
        cursor = conn.cursor()
        
        if store_id and naver_store_id:
            cursor.execute("""
                SELECT * FROM naver_menu_stats 
                WHERE store_id = %s AND naver_store_id = %s
            """, (store_id, naver_store_id))
        elif store_id:
            cursor.execute("""
                SELECT * FROM naver_menu_stats 
                WHERE store_id = %s
            """, (store_id,))
        else:
            cursor.execute("""
                SELECT * FROM naver_menu_stats 
                WHERE naver_store_id = %s
            """, (naver_store_id,))
        
        stats = cursor.fetchall()
        
        # 컬럼명 가져오기
        columns = [desc[0] for desc in cursor.description]
        
        # 결과를 딕셔너리로 변환
        result = []
        for row in stats:
            result.append(dict(zip(columns, row)))
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'stats': result
        })
        
    except Exception as e:
        logger.error(f"메뉴 통계 조회 중 오류: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logger.info("Python 스크립트 서버 시작")
    logger.info(f"스크립트 경로: {script_runner.script_path}")
    logger.info(f"출력 디렉토리: {script_runner.output_dir}")
    
    app.run(
        host='0.0.0.0',
        port=8000,
        debug=False,
        threaded=True
    )
