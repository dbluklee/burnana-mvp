// Socket.IO 연결
const socket = io();

// 현재 시간 업데이트
function updateDateTime() {
    const now = new Date();
    const options = { 
        month: 'long', 
        day: 'numeric', 
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    };
    const dateStr = now.toLocaleDateString('ko-KR', options);
    document.getElementById('datetime').textContent = dateStr;
}

// 테이블 데이터 생성
function createTables() {
    const tablesGrid = document.getElementById('tablesGrid');
    tablesGrid.innerHTML = '';

    // 8개의 테이블 생성 (2x4 그리드)
    for (let i = 1; i <= 8; i++) {
        const tableCard = document.createElement('div');
        tableCard.className = 'table-card';
        tableCard.id = `table-${i}`;

        if (i === 1) {
            // Table 1은 활성 상태로 설정 (6개 음식 예시)
            tableCard.classList.add('active', 'occupied');
            tableCard.innerHTML = createTableCardHTML(i, 'Room 1', '00:05', 4, [
                { name: '토마토 파스타', quantity: 1 },
                { name: '샐러드', quantity: 1 },
                { name: '까르보나라', quantity: 1 },
                { name: '물냉면', quantity: 1 },
                { name: '비빔냉면', quantity: 1 },
                { name: '제육볶음', quantity: 1 }
            ], 60000);
        } else if (i === 2) {
            // Table 2는 4개 음식 예시
            tableCard.classList.add('occupied');
            tableCard.innerHTML = createTableCardHTML(i, 'Room 1', '00:12', 5, [
                { name: '비빔냉면', quantity: 2 },
                { name: '제육볶음', quantity: 1 },
                { name: '김치찌개', quantity: 1 },
                { name: '된장찌개', quantity: 1 }
            ], 45000);
        } else {
            // 빈 테이블
            tableCard.innerHTML = createTableCardHTML(i, 'Room 1', '--:--', 0, [], 0);
        }

        // 테이블 카드 클릭 이벤트 추가
        setupTableCardEvents(tableCard, i);
        
        tablesGrid.appendChild(tableCard);
    }
}

// 테이블 카드 HTML 생성 함수
function createTableCardHTML(tableNumber, roomName, time, guests, orders, totalAmount) {
    const totalOrders = orders.length;
    
    // 화면 크기에 따라 표시할 음식 개수 결정
    let maxDisplayOrders = 4;
    let showExtraInSlot = false;
    
    if (window.innerWidth <= 768) {
        // 작은 카드: 2개까지 표시, 3개 이상이면 1개만 표시하고 2번째 슬롯에 "외 N개"
        if (totalOrders > 2) {
            maxDisplayOrders = 1;
            showExtraInSlot = true;
        } else {
            maxDisplayOrders = 2;
        }
    } else if (window.innerWidth <= 1024) {
        // 중간 카드: 3개까지 표시, 4개 이상이면 2개만 표시하고 3번째 슬롯에 "외 N개"
        if (totalOrders > 3) {
            maxDisplayOrders = 2;
            showExtraInSlot = true;
        } else {
            maxDisplayOrders = 3;
        }
    } else {
        // 큰 카드: 4개까지 표시, 5개 이상이면 3개만 표시하고 4번째 슬롯에 "외 N개"
        if (totalOrders > 4) {
            maxDisplayOrders = 3;
            showExtraInSlot = true;
        } else {
            maxDisplayOrders = 4;
        }
    }
    
    const displayOrders = orders.slice(0, maxDisplayOrders);
    const extraCount = totalOrders - maxDisplayOrders;
    
    let orderNamesHTML = '';
    let orderQuantitiesHTML = '';
    
    displayOrders.forEach(order => {
        orderNamesHTML += `
            <div class="order-name">${order.name}</div>
        `;
        orderQuantitiesHTML += `
            <div class="order-quantity">${order.quantity}</div>
        `;
    });
    
    // "외 N개"를 슬롯에 표시
    if (showExtraInSlot && extraCount > 0) {
        orderNamesHTML += `
            <div class="order-name extra-item">외 ${extraCount}개</div>
        `;
        orderQuantitiesHTML += `
            <div class="order-quantity"></div>
        `;
    }

    // 손님이 있는 경우와 없는 경우 구분
    if (guests > 0 && totalOrders > 0) {
        return `
            <div class="table-content">
                <div class="table-left">
                    <div class="room-name">${roomName}</div>
                    <div class="table-number">Table ${tableNumber}</div>
                    <div class="order-names">
                        ${orderNamesHTML}
                    </div>
                </div>
                <div class="table-right">
                    <div class="table-time">${time}</div>
                    <div class="table-guests">${guests} Person</div>
                    <div class="order-quantities">
                        ${orderQuantitiesHTML}
                    </div>
                </div>
            </div>
            <div class="table-summary">
                <div class="total-orders">총 주문수량: ${totalOrders}개</div>
                <div class="total-amount">${totalAmount.toLocaleString()}원</div>
            </div>
        `;
    } else {
        // 빈 테이블
        return `
            <div class="table-content">
                <div class="table-left">
                    <div class="room-name">${roomName}</div>
                    <div class="table-number">Table ${tableNumber}</div>
                </div>
                <div class="table-right">
                </div>
            </div>
            <div class="table-summary">
            </div>
        `;
    }
}

// 실제 로그 시스템
let activityLogs = [];

// 로그 추가 함수
function addLog(message, type = 'info') {
    const now = new Date();
    const time = now.toLocaleTimeString('ko-KR', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    });
    
    const log = {
        time: time,
        message: message,
        type: type,
        timestamp: now
    };
    
    activityLogs.unshift(log); // 최신 로그를 맨 위에 추가
    
    // 최대 50개 로그만 유지
    if (activityLogs.length > 50) {
        activityLogs = slice(0, 50);
    }
    
    renderLogs();
}

// 로그 렌더링 함수
function renderLogs() {
    const activityLog = document.getElementById('activityLog');
    activityLog.innerHTML = '';

    activityLogs.forEach(log => {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${log.type}`;
        
        // 테이블 번호가 포함된 메시지인지 확인
        const tableMatch = log.message.match(/테이블 (\d+)/);
        const tableBadge = tableMatch ? `<span class="log-table-badge">Table ${tableMatch[1]}</span>` : '';
        
        logEntry.innerHTML = `
            <div class="log-time">${log.time}</div>
            <div class="log-message">${tableBadge}${log.message}</div>
        `;
        activityLog.appendChild(logEntry);
    });
}

// 초기 로그 생성
function createInitialLogs() {
    addLog('대시보드가 시작되었습니다.', 'system');
    addLog('웹소켓 연결을 시도합니다...', 'system');
}

// 네비게이션 스크롤 기능
let currentScrollPosition = 0;
const scrollStep = 200;

function scrollLeft() {
    const roomTabs = document.querySelector('.room-tabs');
    const container = document.querySelector('.room-tabs-container');
    
    if (roomTabs && container) {
        currentScrollPosition = Math.max(currentScrollPosition - scrollStep, 0);
        roomTabs.style.transform = `translateX(-${currentScrollPosition}px)`;
        updateNavigationArrows();
    }
}

function scrollRight() {
    const roomTabs = document.querySelector('.room-tabs');
    const container = document.querySelector('.room-tabs-container');
    
    if (roomTabs && container) {
        const maxScroll = roomTabs.scrollWidth - container.clientWidth;
        currentScrollPosition = Math.min(currentScrollPosition + scrollStep, maxScroll);
        roomTabs.style.transform = `translateX(-${currentScrollPosition}px)`;
        updateNavigationArrows();
    }
}

function updateNavigationArrows() {
    const prevBtn = document.getElementById('navLeft');
    const nextBtn = document.getElementById('navRight');
    const roomTabs = document.querySelector('.room-tabs');
    const container = document.querySelector('.room-tabs-container');
    
    if (prevBtn && nextBtn && roomTabs && container) {
        const tabsWidth = roomTabs.scrollWidth;
        const containerWidth = container.clientWidth;
        
        // 왼쪽 화살표 표시/숨김
        if (currentScrollPosition > 0) {
            prevBtn.style.display = 'block';
        } else {
            prevBtn.style.display = 'none';
        }
        
        // 오른쪽 화살표 표시/숨김
        if (currentScrollPosition < tabsWidth - containerWidth) {
            nextBtn.style.display = 'block';
        } else {
            nextBtn.style.display = 'none';
        }
    }
}

// 햄버거 버튼 클릭 이벤트
function setupHamburgerBtn() {
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sideMenu = document.getElementById('sideMenu');
    
    hamburgerBtn.addEventListener('click', function() {
        console.log('햄버거 메뉴 클릭됨');
        sideMenu.classList.toggle('open');
    });

    // 사이드 메뉴 외부 클릭 시 닫기
    document.addEventListener('click', function(event) {
        if (!sideMenu.contains(event.target) && !hamburgerBtn.contains(event.target)) {
            sideMenu.classList.remove('open');
        }
    });

    // Back 버튼 클릭 이벤트
    const backBtn = document.getElementById('backBtn');
    backBtn.addEventListener('click', function() {
        sideMenu.classList.remove('open');
    });
}

// 사이드 메뉴 네비게이션 이벤트
function setupSideMenuNav() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            
            // 모든 네비게이션 아이템에서 active 클래스 제거
            navItems.forEach(nav => nav.classList.remove('active'));
            // 클릭된 아이템에 active 클래스 추가
            this.classList.add('active');
            
            const page = this.getAttribute('data-page');
            console.log('페이지 변경:', page);
            
            // 페이지 전환
            switchPage(page);
            
            // 사이드 메뉴 닫기
            document.getElementById('sideMenu').classList.remove('open');
        });
    });
}

// 페이지 전환 함수
function switchPage(pageName) {
    // 모든 페이지 숨기기
    const allPages = document.querySelectorAll('.page-content');
    allPages.forEach(page => {
        page.style.display = 'none';
    });
    
    // 선택된 페이지 보이기
    const targetPage = document.getElementById(pageName + 'Page');
    if (targetPage) {
        targetPage.style.display = 'grid';
    }
    
    // 헤더 타이틀 업데이트
    const dashboardTitle = document.querySelector('.dashboard-title');
    if (dashboardTitle) {
        dashboardTitle.textContent = pageName.charAt(0).toUpperCase() + pageName.slice(1);
    }
}

// 주문내역 표시 함수
function showOrderDetails(tableNumber, card) {
    // 모든 테이블 카드에서 선택 상태 제거
    document.querySelectorAll('.table-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // 선택된 테이블 카드에 선택 상태 추가
    card.classList.add('selected');
    
    // 인스펙터 타이틀 변경
    const panelTitle = document.querySelector('.panel-title');
    if (panelTitle) {
        panelTitle.textContent = '주문내역';
    }
    
    // 주문내역 데이터 생성 (실제로는 DB에서 가져와야 함)
    const orderData = generateOrderData(tableNumber);
    
    // 주문내역 표시
    displayOrderDetails(orderData);
}

// 주문내역 데이터 생성 함수 (임시)
function generateOrderData(tableNumber) {
    // 실제로는 DB에서 가져와야 하는 데이터
    const mockOrders = {
        1: [
            { name: '토마토 파스타', quantity: 1, price: 15000 },
            { name: '샐러드', quantity: 1, price: 8000 },
            { name: '까르보나라', quantity: 1, price: 18000 },
            { name: '물냉면', quantity: 1, price: 12000 },
            { name: '비빔냉면', quantity: 1, price: 12000 },
            { name: '제육볶음', quantity: 1, price: 16000 }
        ],
        2: [
            { name: '비빔냉면', quantity: 2, price: 12000 },
            { name: '제육볶음', quantity: 1, price: 16000 },
            { name: '김치찌개', quantity: 1, price: 14000 },
            { name: '된장찌개', quantity: 1, price: 13000 }
        ]
    };
    
    return {
        tableNumber: tableNumber,
        orders: mockOrders[tableNumber] || [],
        totalAmount: mockOrders[tableNumber]?.reduce((sum, order) => sum + (order.price * order.quantity), 0) || 0,
        orderTime: new Date().toLocaleTimeString('ko-KR', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        })
    };
}

// 주문내역 표시 함수
function displayOrderDetails(orderData) {
    const activityLog = document.getElementById('activityLog');
    activityLog.innerHTML = '';
    
    // 테이블 정보 헤더
    const tableHeader = document.createElement('div');
    tableHeader.className = 'order-header';
    tableHeader.innerHTML = `
        <div class="order-table-info">
            <h3>Table ${orderData.tableNumber}</h3>
            <div class="order-time">주문시간: ${orderData.orderTime}</div>
        </div>
    `;
    activityLog.appendChild(tableHeader);
    
    // 주문 항목들
    orderData.orders.forEach((order, index) => {
        const orderItem = document.createElement('div');
        orderItem.className = 'order-item-detail';
        orderItem.innerHTML = `
            <div class="order-item-left">
                <div class="order-item-name">${order.name}</div>
                <div class="order-item-price">${order.price.toLocaleString()}원</div>
            </div>
            <div class="order-item-right">
                <div class="order-item-quantity">${order.quantity}개</div>
                <div class="order-item-total">${(order.price * order.quantity).toLocaleString()}원</div>
            </div>
        `;
        activityLog.appendChild(orderItem);
    });
    
    // 총계
    const orderTotal = document.createElement('div');
    orderTotal.className = 'order-total';
    orderTotal.innerHTML = `
        <div class="order-total-label">총 주문금액</div>
        <div class="order-total-amount">${orderData.totalAmount.toLocaleString()}원</div>
    `;
    activityLog.appendChild(orderTotal);
}

// 진행상황 복원 함수
function showProgress() {
    // 모든 테이블 카드에서 선택 상태 제거
    document.querySelectorAll('.table-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // 인스펙터 타이틀 복원
    const panelTitle = document.querySelector('.panel-title');
    if (panelTitle) {
        panelTitle.textContent = '진행상황';
    }
    
    // 기존 로그 표시
    renderLogs();
}

// 테이블 카드 이벤트 설정
function setupTableCardEvents(card, tableNumber) {
    let pressTimer = null;
    let isPressed = false;
    let startTime = 0;
    
    // 터치/마우스 시작
    const handleStart = (e) => {
        e.preventDefault();
        isPressed = true;
        startTime = Date.now();
        
        // 프레스 타이머 시작 (500ms)
        pressTimer = setTimeout(() => {
            if (isPressed) {
                card.classList.add('pressed');
            }
        }, 500);
        
        // 즉시 시각적 피드백
        card.classList.add('pressing');
    };
    
    // 터치/마우스 종료
    const handleEnd = (e) => {
        e.preventDefault();
        isPressed = false;
        
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
        
        // 프레스 상태 제거
        card.classList.remove('pressing', 'pressed');
        
        // 짧은 클릭 처리
        const pressDuration = Date.now() - startTime;
        if (pressDuration < 500) {
            card.classList.add('clicked');
            
            // 손님이 있는 테이블인 경우 주문내역 표시
            if (card.classList.contains('occupied')) {
                showOrderDetails(tableNumber, card);
            } else {
                // 빈 테이블인 경우 진행상황으로 복원
                showProgress();
            }
            
            // 클릭 애니메이션 제거
            setTimeout(() => {
                card.classList.remove('clicked');
            }, 100);
        }
    };
    
    // 터치/마우스 이동 (취소)
    const handleMove = (e) => {
        if (isPressed) {
            isPressed = false;
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
            card.classList.remove('pressing', 'pressed');
        }
    };
    
    // 이벤트 리스너 등록
    card.addEventListener('mousedown', handleStart);
    card.addEventListener('mouseup', handleEnd);
    card.addEventListener('mouseleave', handleEnd);
    card.addEventListener('mouseout', handleMove);
    
    // 터치 이벤트 (모바일/태블릿)
    card.addEventListener('touchstart', handleStart, { passive: false });
    card.addEventListener('touchend', handleEnd, { passive: false });
    card.addEventListener('touchcancel', handleEnd, { passive: false });
    card.addEventListener('touchmove', handleMove, { passive: false });
}

// 공간 탭 클릭 이벤트
function setupRoomTabs() {
    const roomTabs = document.querySelectorAll('.room-tab');
    roomTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // 모든 탭에서 active 클래스 제거
            roomTabs.forEach(t => t.classList.remove('active'));
            // 클릭된 탭에 active 클래스 추가
            this.classList.add('active');
        });
    });
}

// 설정 버튼 이벤트
function setupSettingsBtn() {
    const settingsBtn = document.querySelector('.settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', function() {
            console.log('설정 버튼 클릭됨');
            // TODO: 설정 모달 또는 페이지로 이동
        });
    }
}

// 네비게이션 화살표 이벤트
function setupNavigationArrows() {
    const prevBtn = document.getElementById('navLeft');
    const nextBtn = document.getElementById('navRight');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', scrollLeft);
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', scrollRight);
    }
}

// 웹소켓 이벤트
function setupSocketEvents() {
    socket.on('connect', () => {
        console.log('웹소켓 연결됨');
        addLog('웹소켓 연결이 성공했습니다.', 'success');
    });

    socket.on('disconnect', () => {
        console.log('웹소켓 연결 끊어짐');
        addLog('웹소켓 연결이 끊어졌습니다.', 'warning');
    });

    socket.on('table_update', (data) => {
        console.log('테이블 업데이트:', data);
        addLog(`테이블 ${data.tableId}의 상태가 업데이트되었습니다.`, 'info');
        // TODO: 테이블 상태 실시간 업데이트
    });

    socket.on('order_update', (data) => {
        console.log('주문 업데이트:', data);
        addLog(`테이블 ${data.tableId}에 새로운 주문이 추가되었습니다.`, 'success');
        // TODO: 주문 정보 실시간 업데이트
    });
}

// 윈도우 리사이즈 이벤트
function setupResizeEvent() {
    window.addEventListener('resize', () => {
        // 테이블 카드 재생성 (화면 크기에 따른 음식 표시 개수 조정)
        createTables();
        
        // 네비게이션 화살표 상태 업데이트
        setTimeout(() => {
            updateNavigationArrows();
        }, 100);
    });
}

// 초기화 함수
function initializeDashboard() {
    // 테이블 생성
    createTables();
    
    // 이벤트 설정
    setupHamburgerBtn();
    setupSideMenuNav();
    setupRoomTabs();
    setupSettingsBtn();
    setupNavigationArrows();
    
    // 웹소켓 이벤트 설정
    setupSocketEvents();
    
    // 리사이즈 이벤트 설정
    setupResizeEvent();
    
    // 초기 로그 생성
    createInitialLogs();
    
    // 시간 업데이트 시작
    updateDateTime();
    setInterval(updateDateTime, 60000); // 1분마다 업데이트
    
    // 초기 네비게이션 화살표 상태 설정
    setTimeout(() => {
        updateNavigationArrows();
    }, 100);
}

// DOM 로드 완료 시 초기화
document.addEventListener('DOMContentLoaded', initializeDashboard);
