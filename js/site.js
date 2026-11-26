// Password gate (AES-GCM, key from PBKDF2-SHA256), project views (#/slug) and an image lightbox.
// The portfolio content and confidential images are stored encrypted; nothing readable ships without the password.
(function () {
  var body = document.body;
  var payload = JSON.parse(document.getElementById('payload').textContent);
  var form = document.getElementById('gate-form');
  var input = document.getElementById('gate-password');
  var error = document.getElementById('gate-error');
  var key = null;
  var STORE = 'hs-portfolio-key';

  function b64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function toB64(buf) { var s = ''; new Uint8Array(buf).forEach(function (b) { s += String.fromCharCode(b); }); return btoa(s); }

  function deriveKey(password) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: b64(payload.salt), iterations: payload.iter, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
    });
  }
  function decrypt(k, iv, data) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, k, data); }

  function decryptFile(url) {
    return fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      return decrypt(key, new Uint8Array(buf.slice(0, 12)), buf.slice(12));
    }).then(function (plain) {
      return URL.createObjectURL(new Blob([plain], { type: 'image/jpeg' }));
    });
  }

  function unlock(k, remember) {
    return decrypt(k, b64(payload.iv), b64(payload.ct)).then(function (plain) {
      key = k;
      document.getElementById('top').innerHTML = new TextDecoder().decode(plain);
      body.classList.remove('locked');
      if (remember) {
        crypto.subtle.exportKey('raw', k).then(function (raw) {
          try { sessionStorage.setItem(STORE, toB64(raw)); } catch (e) {}
        });
      }
      document.querySelectorAll('img[data-enc-src]').forEach(function (img) {
        decryptFile(img.getAttribute('data-enc-src')).then(function (u) { img.src = u; });
      });
      start();
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    error.textContent = '';
    var btn = form.querySelector('button');
    btn.disabled = true;
    deriveKey(input.value).then(function (k) { return unlock(k, true); }).catch(function () {
      error.textContent = 'That password is not right. Please try again.';
      input.select();
    }).then(function () { btn.disabled = false; });
  });

  // Stay unlocked for this browser tab after a refresh.
  var saved = null;
  try { saved = sessionStorage.getItem(STORE); } catch (e) {}
  if (saved) {
    crypto.subtle.importKey('raw', b64(saved), 'AES-GCM', true, ['decrypt'])
      .then(function (k) { return unlock(k, false); })
      .catch(function () { try { sessionStorage.removeItem(STORE); } catch (e) {} input.focus(); });
  } else {
    input.focus();
  }

  function start() {
    function show(hash) {
      var slug = (hash || '').replace(/^#\//, '');
      var open = slug ? document.getElementById('project-' + slug) : null;
      document.querySelectorAll('.project').forEach(function (p) { p.classList.toggle('is-open', p === open); });
      body.classList.toggle('viewing-project', !!open);
      if (open) { window.scrollTo(0, 0); document.title = open.dataset.title + ' | Hala Sabbah'; }
      else { document.title = 'Hala Sabbah | Interior Designer – 3D Visualizer'; }
      if (!open && hash && hash.charAt(1) !== '/') {
        var target = document.getElementById(hash.slice(1));
        if (target) target.scrollIntoView();
      }
    }
    window.addEventListener('hashchange', function () { show(location.hash); });
    show(location.hash);

    var lb = document.querySelector('.lightbox');
    var lbImg = lb.querySelector('img');
    var lbCap = lb.querySelector('p');
    var list = [], index = 0, opener = null, token = 0;

    function render() {
      var b = list[index], mine = ++token;
      lbImg.alt = b.querySelector('img').alt;
      lbCap.textContent = b.dataset.caption || '';
      if (b.dataset.fullEnc) {
        lbImg.src = b.querySelector('img').src;
        decryptFile(b.dataset.fullEnc).then(function (u) { if (mine === token) lbImg.src = u; });
      } else {
        lbImg.src = b.dataset.full;
      }
    }
    function openAt(btn) {
      var gallery = btn.closest('.project') || document;
      list = Array.prototype.slice.call(gallery.querySelectorAll('.shot button'));
      index = list.indexOf(btn);
      opener = btn;
      render();
      lb.classList.add('is-open');
      lb.querySelector('.lb-close').focus();
    }
    function close() {
      lb.classList.remove('is-open');
      lbImg.removeAttribute('src');
      if (opener) opener.focus();
    }
    function step(d) { index = (index + d + list.length) % list.length; render(); }

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.shot button');
      if (btn) { openAt(btn); return; }
      if (e.target === lb) close();
    });
    lb.querySelector('.lb-close').addEventListener('click', close);
    lb.querySelector('.lb-prev').addEventListener('click', function () { step(-1); });
    lb.querySelector('.lb-next').addEventListener('click', function () { step(1); });
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    });
  }

  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
})();
