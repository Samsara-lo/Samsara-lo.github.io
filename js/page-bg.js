/* 非文章页：将全局背景切换为顶部封面图，并加类以便样式加强可读性 */
(function () {
  function applyPageBackground() {
    var container = document.querySelector('.layout > #archive, .layout > #page');
    if (!container) return;

    var header = document.querySelector('#page-header, #banner, .cover') || null;
    if (!header) return;

    var bg = getComputedStyle(header).backgroundImage;
    if (!bg || bg === 'none') return;

    var webBg = document.getElementById('web_bg');
    if (!webBg) return;

    webBg.style.backgroundImage = bg;
    webBg.style.backgroundSize = 'cover';
    webBg.style.backgroundPosition = 'center center';
    webBg.style.backgroundRepeat = 'no-repeat';

    document.body.classList.add('use-page-bg');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPageBackground);
  } else {
    applyPageBackground();
  }

  document.addEventListener('pjax:complete', applyPageBackground);
})();



