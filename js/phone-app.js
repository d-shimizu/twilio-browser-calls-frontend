/**
 * Browser Phone Application
 * A simple browser-based phone using Twilio's JavaScript SDK
 */

// Phone Application Module
const PhoneApp = (function() {
    // Private variables
    let device;
    let activeConnection = null;
    const config = window.config || {};
    
    // DOM Elements
    const elements = {
        status: document.getElementById('call-status'),
        phoneNumber: document.getElementById('phone-number'),
        callControls: document.getElementById('call-controls'),
        answerControls: document.getElementById('answer-controls'),
        hangupControls: document.getElementById('hangup-controls'),
        callButton: document.getElementById('button-call'),
        answerButton: document.getElementById('button-answer'),
        rejectButton: document.getElementById('button-reject'),
        hangupButton: document.getElementById('button-hangup')
    };

    /**
     * Update the UI status message
     * @param {string} message - Status message to display
     */
    function updateStatus(message) {
        elements.status.textContent = message;
    }

    /**
     * Reset UI to initial state
     */
    function resetUI() {
        elements.callControls.style.display = 'block';
        elements.hangupControls.style.display = 'none';
        elements.answerControls.style.display = 'none';
    }

    /**
     * Set up the Twilio device
     */
    async function setupDevice() {
        try {
            updateStatus('Initializing phone...');
            
            const response = await fetch(`http://example.com/voice/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            
            // レスポンスの生データを取得
            const rawData = await response.text();
            
            // コンソールに生データを表示（デバッグ用）
            console.log('Raw token response:', rawData);
            
            let token;
            
            try {
                // JSONとしてパースを試みる
                const data = JSON.parse(rawData);
                token = data.token;
                
                // トークンが存在するか確認
                if (!token) {
                    throw new Error('Token is missing in the response');
                }
                
                console.log('Token type:', typeof token);
                
                // トークンが文字列でない場合は変換
                if (typeof token !== 'string') {
                    console.warn('Token is not a string, attempting to convert');
                    token = String(token);
                }
            } catch (jsonError) {
                // レスポンスがJSONでない場合、テキスト全体をトークンとして扱う
                console.log('Response is not JSON, using raw text as token');
                token = rawData;
            }
            
            // Twilioクライアントの初期化（新しいAPIと古いAPI両方に対応）
            try {
                // 最新のTwilio SDKの場合（推奨方法）
                device = new Twilio.Device(token, {
                    debug: true,
                    warnings: true,
                    allowIncomingWhileBusy: true,
                    // コーデック設定を追加
                    codecPreferences: ['opus', 'pcmu'],
                    // リンギングステートを有効化
                    enableRingingState: true
                });
                console.log('Initialized device with new Twilio.Device API');
                
                // デバイスをTwilioに登録（着信通話を受信するために必要）
                await device.register();
                console.log('Device registered with Twilio');
            } catch (deviceError) {
                console.warn('Failed to initialize with new API, trying legacy method:', deviceError);
                
                // 古いTwilio SDKの場合のフォールバック
                device = new Twilio.Device();
                await device.setup(token, {
                    debug: true,
                    warnings: true,
                    allowIncomingWhileBusy: true
                });
                console.log('Initialized device with legacy Twilio.Device.setup API');
            }

            setupEventListeners();
            updateStatus('Ready to make and receive calls');
        } catch (error) {
            console.error('Error setting up device:', error);
            
            // より詳細なエラー情報を表示
            let errorMessage = `Error: ${error.message}`;
            
            // Twilioの特定のエラーコードをチェック
            if (error.code) {
                errorMessage += ` (Code: ${error.code})`;
            }
            
            // スタックトレースをコンソールに出力（デバッグ用）
            if (error.stack) {
                console.error('Error stack:', error.stack);
            }
            
            updateStatus(errorMessage);
        }
    }

    /**
     * Set up event listeners for the Twilio device and UI elements
     */
    function setupEventListeners() {
        // Twilio device events
        device.on('error', function(error) {
            console.error('Twilio Device Error:', error);
            updateStatus(`Error: ${error.message}`);
        });

        device.on('ready', function() {
            updateStatus('Ready to make and receive calls');
        });
        
        // 登録イベントをリッスン
        device.on('registered', function() {
            console.log('Device successfully registered with Twilio');
            updateStatus('Device registered - Ready to receive calls');
        });
        
        device.on('unregistered', function() {
            console.log('Device unregistered from Twilio');
            updateStatus('Device unregistered - Cannot receive calls');
            
            // 再登録を試みる
            try {
                device.register();
            } catch (err) {
                console.error('Failed to re-register device:', err);
            }
        });

        // 着信処理
        device.on('incoming', handleIncomingCall);
        
        // 接続イベント
        device.on('connect', handleCallConnected);
        device.on('disconnect', handleCallDisconnected);
        
        // 着信ベル鳴動イベント（新しいTwilio SDKの場合）
        if (device.on && typeof device.on === 'function') {
            try {
                device.on('ringing', function() {
                    console.log('Call is ringing');
                    updateStatus('Call is ringing...');
                });
            } catch (e) {
                console.warn('Ringing event not supported on this version of Twilio SDK');
            }
        }
        
        // Button event listeners
        elements.callButton.addEventListener('click', makeCall);
        elements.hangupButton.addEventListener('click', hangUp);
        
        // Phone number input events
        elements.phoneNumber.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                makeCall();
            }
        });
    }

    /**
     * Handle incoming call
     * @param {Object} connection - Twilio Connection object
     */
    function handleIncomingCall(connection) {
        console.log('Incoming call received!');
        
        // コール情報をログに出力
        if (connection) {
            console.log('Connection parameters:', connection.parameters);
            
            // Twilioの新しいバージョンではオブジェクトの構造が異なる場合がある
            if (connection.parameters) {
                console.log('Call parameters available:', connection.parameters);
            } else if (connection.customParameters) {
                console.log('Custom parameters available:', connection.customParameters);
            }
            
            // コールSIDの確認（デバッグ用）
            try {
                // 新しいSDKでは.parameters.CallSid、古いSDKではdifferent pathかもしれない
                const callSid = connection.parameters?.CallSid || 
                               connection.customParameters?.CallSid || 
                               connection.callSid || 
                               'Unknown';
                console.log('Call SID:', callSid);
            } catch (err) {
                console.warn('Could not retrieve Call SID:', err);
            }
        } else {
            console.warn('Connection object is null or undefined');
        }
        
        // アクティブコネクションを設定
        activeConnection = connection;
        
        // 発信元番号の取得
        const fromNumber = connection && connection.parameters && connection.parameters.From 
            ? connection.parameters.From 
            : 'Unknown Caller';
        
        updateStatus(`Incoming call from ${fromNumber}`);
        
        // UIを更新
        elements.answerControls.style.display = 'block';
        elements.callControls.style.display = 'none';

        // Answer button handler
        elements.answerButton.onclick = function() {
            try {
                console.log('Accepting incoming call...');
                
                // 着信を受ける（新しいSDKでは追加のオプションが必要かもしれない）
                if (typeof connection.accept === 'function') {
                    connection.accept();
                    console.log('Call accepted successfully');
                } else {
                    console.error('connection.accept is not a function');
                }
                
                updateStatus('Call connected');
                elements.answerControls.style.display = 'none';
                elements.hangupControls.style.display = 'block';
            } catch (err) {
                console.error('Error accepting call:', err);
                updateStatus(`Error accepting call: ${err.message}`);
            }
        };
        
        // Reject button handler
        elements.rejectButton.onclick = function() {
            try {
                console.log('Rejecting incoming call...');
                
                if (typeof connection.reject === 'function') {
                    connection.reject();
                    console.log('Call rejected successfully');
                } else {
                    console.error('connection.reject is not a function');
                    // 代替として切断を試みる
                    if (typeof connection.disconnect === 'function') {
                        connection.disconnect();
                    }
                }
                
                updateStatus('Call rejected');
                activeConnection = null;
                resetUI();
            } catch (err) {
                console.error('Error rejecting call:', err);
                updateStatus(`Error rejecting call: ${err.message}`);
            }
        };
    }

    /**
     * Handle call connected event
     * @param {Object} connection - Twilio Connection object
     */
    function handleCallConnected(connection) {
        activeConnection = connection;
        console.log('Call connected:', connection);
        updateStatus('Call in progress...');
        
        elements.callControls.style.display = 'none';
        elements.hangupControls.style.display = 'block';
        elements.answerControls.style.display = 'none';
    }

    /**
     * Handle call disconnected event
     * @param {Object} connection - Twilio Connection object
     */
    function handleCallDisconnected(connection) {
        console.log('Call disconnected:', connection);
        updateStatus('Call ended');
        activeConnection = null;
        resetUI();
    }

    /**
     * Make outbound call
     */
    async function makeCall() {
        const phoneNumber = elements.phoneNumber.value;
        
        if (!phoneNumber) {
            updateStatus('Please enter a phone number');
            return;
        }
        
        updateStatus(`Calling ${phoneNumber}...`);
        
        try {
            const response = await fetch(`http://example.com/voice/outbound-calls`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `To=${encodeURIComponent(phoneNumber)}`
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error making call:', error);
            updateStatus(`Error making call: ${error.message}`);
        }
    }

    /**
     * Hang up active call
     */
    function hangUp() {
        if (activeConnection) {
            activeConnection.disconnect();
        } else {
            device.disconnectAll();
        }
    }

    /**
     * Public API
     */
    return {
        init: function() {
            setupDevice();
        }
    };
})();

// Initialize the application when DOM is fully loaded
document.addEventListener('DOMContentLoaded', PhoneApp.init);
