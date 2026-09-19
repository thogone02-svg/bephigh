/*
 * 원고 작업실 페이지와 확장 사이를 잇는 다리.
 *
 * 웹페이지는 확장을 직접 못 불러요. 그래서 페이지가 window 로 말을 걸면
 * 여기서 받아 확장에 넘기고, 확장이 알려주는 진행 상황을 다시 페이지로 보냅니다.
 * 이 방식이면 확장 아이디를 몰라도 돼서, 설치한 그대로 바로 됩니다.
 */

const FROM_PAGE = 'nabi-cafe-request';
const TO_PAGE = 'nabi-cafe-event';

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.channel !== FROM_PAGE) {
    return;
  }

  chrome.runtime.sendMessage(event.data.payload, (reply) => {
    window.postMessage(
      {
        channel: TO_PAGE,
        payload: chrome.runtime.lastError
          ? { type: 'error', message: chrome.runtime.lastError.message }
          : reply,
      },
      '*',
    );
  });
});

// 올리는 동안 한 단계씩 끝날 때마다 알려줍니다.
chrome.runtime.onMessage.addListener((message) => {
  window.postMessage({ channel: TO_PAGE, payload: message }, '*');
});

// 확장이 깔려 있다는 걸 페이지가 알 수 있게 표시를 남겨요.
document.documentElement.dataset.nabiCafe = chrome.runtime.getManifest().version;
