/* Append the next generated batch to the same article list. */
(function () {
  'use strict';

  var dispose = null;

  function init() {
    if (dispose) dispose();
    dispose = null;

    var root = document.querySelector('#recent-posts[data-infinite-feed]');
    if (!root || root.classList.contains('masonry') || !window.fetch || !window.AbortController) return;
    var list = root.querySelector('.recent-post-items');
    var pager = root.querySelector('#pagination');
    if (!list || !pager) return;

    function pageUrl(href, base) {
      var url = new URL(href, base);
      if (url.origin !== location.origin) throw new Error('Unexpected page origin');
      url.hash = '';
      return url.href;
    }

    function nextPage(scope, base) {
      var link = scope.querySelector('#pagination a.next, #pagination a[rel="next"]');
      return link ? pageUrl(link.getAttribute('href'), base) : null;
    }

    function articleKey(item, base) {
      var link = item.querySelector('a.article-title[href]');
      return link ? new URL(link.getAttribute('href'), base).href : null;
    }

    var nextUrl = nextPage(root, location.href);
    var seenPages = new Set([pageUrl(location.href, location.href)]);
    var seenArticles = new Set();
    list.querySelectorAll('.recent-post-item').forEach(function (item) {
      var key = articleKey(item, location.href);
      if (key) seenArticles.add(key);
    });

    var status = document.createElement('div');
    status.className = 'post-feed-status';
    var message = document.createElement('span');
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'post-feed-button';
    button.textContent = '加载更多';
    status.append(message, button);
    root.insertBefore(status, pager);
    root.classList.add('is-infinite-feed');

    var loading = false;
    var failed = false;
    var disposed = false;
    var controller = null;
    var observer = null;

    function updateStatus() {
      list.setAttribute('aria-busy', String(loading));
      button.disabled = loading;
      button.hidden = !nextUrl;
      if (!nextUrl) {
        message.textContent = '已经到底啦 · 共 ' + seenArticles.size + ' 篇';
        if (observer) observer.disconnect();
      } else if (loading) {
        message.textContent = '正在加载文章…';
      } else if (failed) {
        message.textContent = '暂时没加载出来，请重试';
        button.textContent = '重新加载';
      } else {
        message.textContent = '继续往下，还有更多文章';
        button.textContent = '加载更多';
      }
    }

    async function loadMore() {
      if (disposed || loading || !nextUrl) return;
      loading = true;
      failed = false;
      updateStatus();
      var requestUrl = nextUrl;
      controller = new AbortController();
      var timeout = window.setTimeout(function () { controller.abort(); }, 15000);

      try {
        if (seenPages.has(requestUrl)) throw new Error('Repeated page');
        var response = await fetch(requestUrl, { signal: controller.signal, credentials: 'same-origin' });
        if (!response.ok) throw new Error('Could not load page');
        var html = await response.text();
        if (disposed) return;
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var source = doc.querySelector('#recent-posts[data-infinite-feed] .recent-post-items');
        if (!source) throw new Error('Missing article list');
        var followingUrl = nextPage(doc, requestUrl);
        if (followingUrl && (followingUrl === requestUrl || seenPages.has(followingUrl))) {
          throw new Error('Repeated next page');
        }

        var fragment = document.createDocumentFragment();
        var additions = new Set();
        source.querySelectorAll('.recent-post-item:not(.ads-wrap)').forEach(function (item) {
          var key = articleKey(item, requestUrl);
          if (!key || seenArticles.has(key) || additions.has(key)) return;
          var card = document.importNode(item, true);
          card.querySelectorAll('img').forEach(function (img) {
            img.loading = 'lazy';
            img.decoding = 'async';
          });
          fragment.appendChild(card);
          additions.add(key);
        });
        if (!additions.size) throw new Error('No new articles');

        list.appendChild(fragment);
        additions.forEach(function (key) { seenArticles.add(key); });
        seenPages.add(requestUrl);
        nextUrl = followingUrl;
        var newPager = doc.querySelector('#pagination');
        pager.replaceChildren();
        if (newPager) Array.from(newPager.childNodes).forEach(function (node) {
          pager.appendChild(document.importNode(node, true));
        });
        // Refresh only the features used by newly appended content.
        try {
          if (window.lazyLoadInstance) window.lazyLoadInstance.update();
          if (window.pjax) window.pjax.refresh(list);
        } catch (error) {
          console.warn('Article enhancement could not refresh', error);
        }
      } catch (error) {
        if (!disposed) failed = true;
      } finally {
        window.clearTimeout(timeout);
        controller = null;
        loading = false;
        if (!disposed) {
          updateStatus();
          // Re-observe at its new position, including when the viewport is very tall.
          if (observer && nextUrl && !failed) {
            observer.unobserve(status);
            observer.observe(status);
          }
        }
      }
    }

    button.addEventListener('click', loadMore);
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(function (entries) {
        if (!failed && entries.some(function (entry) { return entry.isIntersecting; })) loadMore();
      }, { rootMargin: '500px 0px' });
      if (nextUrl) observer.observe(status);
    }
    updateStatus();

    dispose = function () {
      disposed = true;
      if (observer) observer.disconnect();
      if (controller) controller.abort();
      button.removeEventListener('click', loadMore);
      list.removeAttribute('aria-busy');
      status.remove();
      root.classList.remove('is-infinite-feed');
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
  document.addEventListener('pjax:send', function () {
    if (dispose) dispose();
    dispose = null;
  });
  document.addEventListener('pjax:complete', init);
})();
