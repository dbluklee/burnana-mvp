const { spawn } = require('child_process');
const path = require('path');

/**
 * 파이썬 파일을 실행하는 함수
 * @param {string} pythonFilePath - 실행할 파이썬 파일 경로
 * @param {Array} args - 파이썬 스크립트에 전달할 인자들
 * @param {Object} options - 실행 옵션
 * @returns {Promise<Object>} 실행 결과
 */
function runPythonScript(pythonFilePath, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const pythonPath = options.pythonPath || 'python3';
    const scriptPath = path.resolve(pythonFilePath);
    
    console.log(`🐍 [Python 실행] ${scriptPath} ${args.join(' ')}`);
    
    const pythonProcess = spawn(pythonPath, [scriptPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env }
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ [Python 실행 완료] ${scriptPath}`);
        resolve({
          success: true,
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      } else {
        console.error(`❌ [Python 실행 실패] ${scriptPath} (코드: ${code})`);
        console.error(`stderr: ${stderr}`);
        reject({
          success: false,
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      }
    });

    pythonProcess.on('error', (error) => {
      console.error(`❌ [Python 실행 오류] ${scriptPath}:`, error.message);
      reject({
        success: false,
        error: error.message
      });
    });

    // 타임아웃 설정 (기본 30초)
    const timeout = options.timeout || 30000;
    setTimeout(() => {
      pythonProcess.kill('SIGTERM');
      reject({
        success: false,
        error: '실행 시간 초과',
        timeout: true
      });
    }, timeout);
  });
}

/**
 * 가입 완료 후 실행할 파이썬 스크립트 (HTTP API 사용)
 * @param {Object} storeData - 저장된 매장 데이터
 * @param {string} naverUrl - 네이버 가게 URL
 */
async function runPostSignupScript(storeData, naverUrl) {
  try {
    // Python 서버 설정
    const pythonHost = process.env.PYTHON_SERVICE_HOST || 'localhost';
    const pythonPort = process.env.PYTHON_SERVICE_PORT || '8000';
    const pythonUrl = `http://${pythonHost}:${pythonPort}`;
    
    console.log(`🎯 [후처리 시작] 매장 ${storeData.id}: Python 서버 호출`);
    
    // Python 서버에 작업 요청
    const response = await fetch(`${pythonUrl}/run-script`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        store_id: storeData.id,
        store_name: storeData.store_name,
        business_number: storeData.business_number,
        naver_url: naverUrl || ''
      })
    });

    if (!response.ok) {
      throw new Error(`Python 서버 응답 오류: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.success) {
      console.log(`🎯 [후처리 요청 완료] 매장 ${storeData.id}: 작업 ID ${result.task_id}`);
      
      // 백그라운드에서 작업 상태 확인 (선택사항)
      setTimeout(async () => {
        try {
          const statusResponse = await fetch(`${pythonUrl}/task-status/${result.task_id}`);
          if (statusResponse.ok) {
            const statusResult = await statusResponse.json();
            if (statusResult.status === 'completed') {
              console.log(`🎯 [후처리 완료] 매장 ${storeData.id}: ${statusResult.result.success ? '성공' : '실패'}`);
            }
          }
        } catch (statusError) {
          console.error(`❌ [후처리 상태 확인 실패] 매장 ${storeData.id}:`, statusError.message);
        }
      }, 5000); // 5초 후 상태 확인
      
      return { success: true, task_id: result.task_id };
    } else {
      throw new Error(result.error || 'Python 서버에서 오류 발생');
    }

  } catch (error) {
    console.error(`❌ [후처리 실패] 매장 ${storeData.id}:`, error);
    // 파이썬 스크립트 실행 실패해도 가입 프로세스는 계속 진행
    return { success: false, error: error.message };
  }
}

module.exports = {
  runPythonScript,
  runPostSignupScript
};
