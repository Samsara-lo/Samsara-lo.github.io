/* 首页性能优化 + 无限滚动：
 * 1) 不改变每页文章数量；首屏正常展示。
 * 2) 对第三篇之后的文章资源做懒加载；并预取接下来两篇的图片到缓存。
 * 3) 触底继续加载下一页并追加。
 */
(function () {
  var container = document.getElementById('recent-posts');
  if (!container) return;

  // 将内置分页条固定到列表底部
  var pager = document.querySelector('nav.pagination, .pagination');
  function stickPagerToBottom() {
    if (!pager) return;
    if (container.nextSibling !== pager) {
      container.parentNode.insertBefore(pager, container.nextSibling);
    }
  }
  stickPagerToBottom();

  var items = Array.prototype.slice.call(container.querySelectorAll('.recent-post-item'));

  // 将图片URL通过无侵入CDN压缩（wsrv.nl）
  function optimizeUrl(url) {
    if (!url) return url;
    if (/^data:/.test(url)) return url;
    if (/^https?:\/\/wsrv\.nl\//.test(url)) return url; // already optimized
    // 绝对或相对地址都支持
    var abs = url[0] === '/' ? (location.origin + url) : url;
    return 'https://wsrv.nl/?url=' + encodeURIComponent(abs) + '&w=900&q=70&output=webp';
  }

  // 懒加载：第4篇起，暂存图片src到data-src
  function prepareLazy(item) {
    var imgs = item.querySelectorAll('img');
    imgs.forEach(function (img) {
      if (img.dataset.lazyPrepared) return;
      var src = img.getAttribute('src');
      if (src) {
        img.setAttribute('data-src', optimizeUrl(src));
        img.removeAttribute('src');
        img.dataset.lazyPrepared = '1';
      }
    });
  }
  for (var i = 3; i < items.length; i++) prepareLazy(items[i]);

  // 首屏前三篇直接替换为压缩后的地址
  for (var j = 0; j < Math.min(3, items.length); j++) {
    items[j].querySelectorAll('img').forEach(function (img) {
      var cur = img.getAttribute('src');
      if (cur) img.setAttribute('src', optimizeUrl(cur));
    });
  }

  // 观察出现即加载；提前 400px 预判
  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      io.unobserve(el);
      el.querySelectorAll('img[data-src]').forEach(function (img) {
        img.setAttribute('src', img.getAttribute('data-src'));
        img.removeAttribute('data-src');
      });
      // 预取其后的两篇
      preloadNextTwo(el);
    });
  }, { rootMargin: '400px 0px' }) : null;

  function preloadItem(item) {
    item.querySelectorAll('img[data-src]').forEach(function (img) {
      var url = img.getAttribute('data-src');
      if (!url) return;
      var im = new Image();
      im.src = url; // 进入缓存
    });
  }
  function preloadNextTwo(currentItem) {
    var idx = items.indexOf ? items.indexOf(currentItem) : Array.prototype.indexOf.call(items, currentItem);
    if (idx < 0) return;
    var a = items[idx + 1];
    var b = items[idx + 2];
    if (a) preloadItem(a);
    if (b) preloadItem(b);
  }

  // 绑定观察器
  items.slice(3).forEach(function (el) { if (io) io.observe(el); });

  // 从 URL 识别当前页码（/page/N/），默认 1
  var m = (location.pathname || '').match(/\/page\/(\d+)\/?/);
  var currentPage = m ? parseInt(m[1], 10) : 1;
  var isLoading = false;
  var reachedEnd = false;
  var nextDocCache = null; // 预取缓存

  function nextPageUrl() {
    return location.origin + '/page/' + (currentPage + 1) + '/';
  }

  // 预取下一页 HTML
  function prefetchNext() {
    if (nextDocCache || reachedEnd) return;
    fetch(nextPageUrl(), { credentials: 'same-origin' })
      .then(function (res) { return res.ok ? res.text() : ''; })
      .then(function (html) {
        if (!html) return;
        nextDocCache = new DOMParser().parseFromString(html, 'text/html');
      })
      .catch(function () { /* ignore */ });
  }

  function onScroll() {
    if (reachedEnd || isLoading) return;
    var nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 400;
    if (!nearBottom) { prefetchNext(); return; }
    isLoading = true;

    (nextDocCache ? Promise.resolve(nextDocCache) : fetch(nextPageUrl(), { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (h) { return h && new DOMParser().parseFromString(h, 'text/html'); }))
      .then(function (doc) {
        nextDocCache = null; // 用过即弃
        if (!doc) {
          reachedEnd = true;
          window.removeEventListener('scroll', onScroll);
          return;
        }
        var newItems = doc.querySelectorAll('#recent-posts .recent-post-item');
        if (!newItems.length) {
          reachedEnd = true;
          window.removeEventListener('scroll', onScroll);
          return;
        }
        newItems.forEach(function (el) { 
          container.appendChild(el);
          items.push(el);
          prepareLazy(el);
          if (io) io.observe(el);
        });
        currentPage += 1;
        prefetchNext();
        stickPagerToBottom();
      })
      .catch(function () { reachedEnd = true; })
      .finally(function () { isLoading = false; });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
})();


