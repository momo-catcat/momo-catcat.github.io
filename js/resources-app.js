/**
 * Resources Wiki — Client Application
 *
 * A GitHub + Vercel-backed internal wiki for research group resources.
 * Authentication: GitHub OAuth  |  Data: private GitHub repo  |  API: Vercel serverless
 * Roles: admin / editor / viewer
 */
(function () {
  'use strict';

  // ============================================================
  // Markdown config
  // ============================================================
  if (window.marked) {
    marked.setOptions({ breaks: true, gfm: true });
  }

  // ============================================================
  // API Client
  // ============================================================
  var api = {
    fetch: function (method, path, body) {
      var opts = {
        method: method,
        credentials: 'same-origin',
        headers: {},
      };
      if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
      return fetch(path, opts).then(function (res) {
        if (res.status === 204) return { ok: true };
        return res.json().then(function (data) {
          data._status = res.status;
          data._ok = res.ok;
          return data;
        });
      });
    },
    getMe: function () { return api.fetch('GET', '/api/auth/me'); },
    getPages: function () { return api.fetch('GET', '/api/wiki/pages'); },
    getPage: function (id) { return api.fetch('GET', '/api/wiki/' + id); },
    createPage: function (data) { return api.fetch('POST', '/api/wiki/pages', data); },
    updatePage: function (id, data) { return api.fetch('PUT', '/api/wiki/' + id, data); },
    deletePage: function (id) { return api.fetch('DELETE', '/api/wiki/' + id); },
    uploadImage: function (filename, base64) {
      return api.fetch('POST', '/api/wiki/upload', { filename: filename, content: base64 });
    },
    getUsers: function () { return api.fetch('GET', '/api/admin/users'); },
    addUser: function (login, role) {
      return api.fetch('POST', '/api/admin/users', { login: login, role: role });
    },
    updateUserRole: function (login, role) {
      return api.fetch('PUT', '/api/admin/users?login=' + encodeURIComponent(login), { role: role });
    },
    removeUser: function (login) {
      return api.fetch('DELETE', '/api/admin/users?login=' + encodeURIComponent(login));
    },
  };

  // ============================================================
  // State
  // ============================================================
  var state = {
    user: null,         // { login, name, avatar, role }
    pages: [],          // array of page metadata
    pagesMap: {},       // id → page metadata
    currentPageId: null,
    currentPageContent: null,
    isEditing: false,
    isNewPage: false,
    newPageParentId: null,
    expandedNodes: {},
    searchQuery: '',
  };

  // ============================================================
  // DOM Helpers
  // ============================================================
  function byId(id) { return document.getElementById(id); }

  var el = {};
  function cacheElements() {
    var ids = [
      'loading-screen', 'unavailable-screen', 'auth-screen', 'pending-screen', 'app-screen',
      'auth-error', 'pending-login',
      'user-avatar', 'user-name', 'user-role', 'admin-btn',
      'resources-sidebar', 'page-search', 'sidebar-actions', 'new-root-page', 'page-tree',
      'mobile-toggle',
      'content-empty', 'content-view', 'content-editor',
      'content-breadcrumb', 'content-title', 'content-body', 'content-meta',
      'content-actions', 'edit-page-btn', 'add-child-btn', 'delete-page-btn',
      'editor-title', 'editor-content', 'editor-preview', 'preview-toggle',
      'save-page-btn', 'cancel-edit-btn', 'editor-status',
      'image-upload-input',
      'admin-modal', 'add-user-login', 'add-user-role', 'add-user-btn', 'add-user-status',
      'users-list',
      'confirm-container',
    ];
    ids.forEach(function (id) {
      el[id.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); })] = byId(id);
    });
  }

  // ============================================================
  // Screen Management
  // ============================================================
  function showScreen(name) {
    var screens = [el.loadingScreen, el.unavailableScreen, el.authScreen, el.pendingScreen, el.appScreen];
    screens.forEach(function (s) { if (s) s.style.display = 'none'; });
    var map = {
      loading: el.loadingScreen,
      unavailable: el.unavailableScreen,
      auth: el.authScreen,
      pending: el.pendingScreen,
      app: el.appScreen,
    };
    if (map[name]) map[name].style.display = '';
  }

  // ============================================================
  // Auth
  // ============================================================
  function checkAuth() {
    // Check for errors from OAuth callback
    var params = new URLSearchParams(window.location.search);
    if (params.get('error')) {
      showScreen('auth');
      showAuthError('Login failed: ' + params.get('error'));
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    api.getMe().then(function (data) {
      if (data._status === 401) {
        showScreen('auth');
        return;
      }
      if (!data._ok) {
        showScreen('auth');
        showAuthError(data.error || 'Authentication error');
        return;
      }
      if (data.role === 'pending') {
        el.pendingLogin.textContent = data.login;
        showScreen('pending');
        return;
      }
      state.user = data;
      initApp();
    }).catch(function (err) {
      // API not available — likely not on Vercel
      console.error('Auth check failed:', err);
      showScreen('unavailable');
    });
  }

  function showAuthError(msg) {
    el.authError.textContent = msg;
    el.authError.style.display = '';
    setTimeout(function () { el.authError.style.display = 'none'; }, 8000);
  }

  // ============================================================
  // App Init
  // ============================================================
  function initApp() {
    // User bar
    el.userName.textContent = state.user.name || state.user.login;
    el.userRole.textContent = state.user.role;
    el.userRole.className = 'label label-' +
      (state.user.role === 'admin' ? 'danger' :
       state.user.role === 'editor' ? 'warning' : 'info');
    if (state.user.avatar) {
      el.userAvatar.src = state.user.avatar;
      el.userAvatar.style.display = '';
    }

    // Role-specific UI
    var canEdit = state.user.role === 'admin' || state.user.role === 'editor';
    el.adminBtn.style.display = state.user.role === 'admin' ? '' : 'none';
    el.sidebarActions.style.display = canEdit ? '' : 'none';

    showScreen('app');
    loadPages();
  }

  // ============================================================
  // Pages — Load & Tree
  // ============================================================
  function loadPages() {
    api.getPages().then(function (data) {
      if (!data._ok) {
        console.error('Failed to load pages:', data.error);
        return;
      }
      state.pages = data.pages || [];
      state.pagesMap = {};
      state.pages.forEach(function (p) { state.pagesMap[p.id] = p; });
      renderTree();

      // Re-render current page if still valid
      if (state.currentPageId && state.pagesMap[state.currentPageId]) {
        if (!state.isEditing) {
          // Reload content in case it changed
          loadAndShowPage(state.currentPageId);
        }
      } else if (state.currentPageId) {
        state.currentPageId = null;
        showContentEmpty();
      }
    }).catch(function (err) {
      console.error('Load pages error:', err);
    });
  }

  // ============================================================
  // Tree Structure
  // ============================================================
  function buildTree(pages, filterFn) {
    var lookup = {};
    var roots = [];

    pages.forEach(function (p) {
      lookup[p.id] = { id: p.id, title: p.title, parentId: p.parentId, order: p.order, children: [] };
    });

    pages.forEach(function (p) {
      var node = lookup[p.id];
      if (p.parentId && lookup[p.parentId]) {
        lookup[p.parentId].children.push(node);
      } else {
        roots.push(node);
      }
    });

    function sortNodes(arr) {
      arr.sort(function (a, b) {
        return (a.order || 0) - (b.order || 0) || (a.title || '').localeCompare(b.title || '');
      });
      arr.forEach(function (n) { sortNodes(n.children); });
    }
    sortNodes(roots);

    if (filterFn) roots = filterTree(roots, filterFn);
    return roots;
  }

  function filterTree(nodes, fn) {
    var result = [];
    nodes.forEach(function (node) {
      var childMatches = filterTree(node.children, fn);
      if (fn(node) || childMatches.length > 0) {
        result.push({ id: node.id, title: node.title, parentId: node.parentId, order: node.order, children: childMatches });
      }
    });
    return result;
  }

  function renderTree() {
    var tree;
    if (state.searchQuery) {
      var q = state.searchQuery.toLowerCase();
      tree = buildTree(state.pages, function (node) {
        return (node.title || '').toLowerCase().indexOf(q) !== -1;
      });
    } else {
      tree = buildTree(state.pages);
    }

    el.pageTree.innerHTML = '';
    if (tree.length === 0) {
      el.pageTree.innerHTML = '<div class="tree-empty">' +
        (state.searchQuery ? 'No pages match your search.' : 'No pages yet. Create one to get started!') +
        '</div>';
      return;
    }
    renderTreeNodes(tree, el.pageTree, 0);
  }

  function renderTreeNodes(nodes, container, level) {
    var canEdit = state.user && (state.user.role === 'admin' || state.user.role === 'editor');

    nodes.forEach(function (node) {
      var hasChildren = node.children && node.children.length > 0;
      var isExpanded = !!state.expandedNodes[node.id] || !!state.searchQuery;
      var isActive = node.id === state.currentPageId;

      var item = document.createElement('div');
      item.className = 'tree-item' + (isActive ? ' active' : '');
      item.style.paddingLeft = (12 + level * 16) + 'px';

      // Toggle caret
      var toggle = document.createElement('span');
      toggle.className = 'tree-toggle';
      if (hasChildren) {
        toggle.innerHTML = isExpanded
          ? '<span class="glyphicon glyphicon-chevron-down"></span>'
          : '<span class="glyphicon glyphicon-chevron-right"></span>';
        toggle.addEventListener('click', (function (id) {
          return function (e) {
            e.stopPropagation();
            state.expandedNodes[id] = !state.expandedNodes[id];
            renderTree();
          };
        })(node.id));
      }
      item.appendChild(toggle);

      // Icon
      var icon = document.createElement('span');
      icon.className = 'tree-icon glyphicon ' + (hasChildren ? 'glyphicon-folder-open' : 'glyphicon-file');
      item.appendChild(icon);

      // Label
      var label = document.createElement('span');
      label.className = 'tree-label';
      label.textContent = node.title || 'Untitled';
      item.appendChild(label);

      // Add child button
      if (canEdit) {
        var addBtn = document.createElement('button');
        addBtn.className = 'tree-action-btn';
        addBtn.title = 'Add sub-page';
        addBtn.innerHTML = '<span class="glyphicon glyphicon-plus"></span>';
        addBtn.addEventListener('click', (function (id) {
          return function (e) {
            e.stopPropagation();
            startNewPage(id);
          };
        })(node.id));
        item.appendChild(addBtn);
      }

      // Click to select
      item.addEventListener('click', (function (id) {
        return function () { selectPage(id); };
      })(node.id));

      container.appendChild(item);

      // Children
      if (hasChildren) {
        var childContainer = document.createElement('div');
        childContainer.className = 'tree-children' + (isExpanded ? '' : ' collapsed');
        renderTreeNodes(node.children, childContainer, level + 1);
        container.appendChild(childContainer);
      }
    });
  }

  // ============================================================
  // Page Selection & Display
  // ============================================================
  function selectPage(pageId) {
    if (state.isEditing) {
      confirmDialog('Unsaved Changes', 'You have unsaved changes. Discard them?', 'Discard', 'btn-danger', function () {
        state.isEditing = false;
        state.isNewPage = false;
        doSelectPage(pageId);
      });
      return;
    }
    doSelectPage(pageId);
  }

  function doSelectPage(pageId) {
    state.currentPageId = pageId;
    state.isEditing = false;
    state.isNewPage = false;
    renderTree();
    loadAndShowPage(pageId);
    if (window.innerWidth <= 768) {
      el.resourcesSidebar.classList.add('collapsed');
    }
  }

  function loadAndShowPage(pageId) {
    el.contentEmpty.style.display = 'none';
    el.contentEditor.style.display = 'none';
    el.contentView.style.display = '';
    el.contentTitle.textContent = 'Loading\u2026';
    el.contentBody.innerHTML = '';
    el.contentMeta.innerHTML = '';

    api.getPage(pageId).then(function (data) {
      if (!data._ok) {
        el.contentTitle.textContent = 'Error';
        el.contentBody.innerHTML = '<p class="text-danger">' + escapeHtml(data.error || 'Failed to load page') + '</p>';
        return;
      }
      state.currentPageContent = data.content || '';
      renderPageView(data);
    }).catch(function (err) {
      el.contentTitle.textContent = 'Error';
      el.contentBody.innerHTML = '<p class="text-danger">Failed to load page.</p>';
      console.error(err);
    });
  }

  function renderPageView(page) {
    var canEdit = state.user && (state.user.role === 'admin' || state.user.role === 'editor');
    var isAdmin = state.user && state.user.role === 'admin';

    el.contentEmpty.style.display = 'none';
    el.contentEditor.style.display = 'none';
    el.contentView.style.display = '';

    el.contentBreadcrumb.innerHTML = buildBreadcrumb(page.id);
    el.contentTitle.textContent = page.title || 'Untitled';
    el.contentBody.innerHTML = renderMarkdown(page.content || '');

    var meta = '';
    if (page.updatedAt) {
      meta = 'Last updated: ' + new Date(page.updatedAt).toLocaleString();
    }
    if (page.updatedBy) meta += ' by ' + page.updatedBy;
    el.contentMeta.innerHTML = meta;

    el.editPageBtn.style.display = canEdit ? '' : 'none';
    el.addChildBtn.style.display = canEdit ? '' : 'none';
    el.deletePageBtn.style.display = isAdmin ? '' : 'none';
  }

  function showContentEmpty() {
    el.contentEmpty.style.display = '';
    el.contentView.style.display = 'none';
    el.contentEditor.style.display = 'none';
  }

  function buildBreadcrumb(pageId) {
    var crumbs = [];
    var id = pageId;
    while (id && state.pagesMap[id]) {
      crumbs.unshift(state.pagesMap[id]);
      id = state.pagesMap[id].parentId;
    }
    return crumbs.map(function (p, i) {
      if (i < crumbs.length - 1) {
        return '<a href="#" data-breadcrumb-id="' + p.id + '">' + escapeHtml(p.title) + '</a>';
      }
      return '<span>' + escapeHtml(p.title) + '</span>';
    }).join('<span class="sep">\u203A</span>');
  }

  // ============================================================
  // Markdown
  // ============================================================
  function renderMarkdown(md) {
    if (!md) return '';
    try {
      var raw = marked.parse(md);
      if (window.DOMPurify) {
        return DOMPurify.sanitize(raw, {
          ADD_TAGS: ['iframe'],
          ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src', 'target'],
        });
      }
      return raw;
    } catch (e) {
      return '<p>' + escapeHtml(md) + '</p>';
    }
  }

  // ============================================================
  // Editing
  // ============================================================
  function startEdit() {
    var page = state.pagesMap[state.currentPageId];
    if (!page) return;
    state.isEditing = true;
    state.isNewPage = false;
    el.editorTitle.value = page.title || '';
    el.editorContent.value = state.currentPageContent || '';
    showEditor();
  }

  function startNewPage(parentId) {
    state.isEditing = true;
    state.isNewPage = true;
    state.newPageParentId = parentId || null;
    el.editorTitle.value = '';
    el.editorContent.value = '';
    showEditor();
    if (parentId) state.expandedNodes[parentId] = true;
  }

  function showEditor() {
    el.contentEmpty.style.display = 'none';
    el.contentView.style.display = 'none';
    el.contentEditor.style.display = '';
    el.editorStatus.textContent = '';
    el.editorStatus.className = 'editor-status';
    el.editorContent.style.display = '';
    el.editorPreview.style.display = 'none';
    el.previewToggle.innerHTML = '<span class="glyphicon glyphicon-eye-open"></span> Preview';
    el.editorTitle.focus();
  }

  function savePage() {
    var title = el.editorTitle.value.trim();
    var content = el.editorContent.value;
    if (!title) { setEditorStatus('Please enter a page title.', 'error'); return; }

    el.savePageBtn.disabled = true;
    setEditorStatus('Saving\u2026');

    var promise;
    if (state.isNewPage) {
      var siblingCount = state.pages.filter(function (p) {
        return (p.parentId || null) === (state.newPageParentId || null);
      }).length;
      promise = api.createPage({
        title: title,
        content: content,
        parentId: state.newPageParentId || null,
        order: siblingCount,
      }).then(function (data) {
        if (!data._ok) throw new Error(data.error || 'Failed to create page');
        state.isEditing = false;
        state.isNewPage = false;
        state.currentPageId = data.page.id;
        if (state.newPageParentId) state.expandedNodes[state.newPageParentId] = true;
        loadPages();
      });
    } else {
      promise = api.updatePage(state.currentPageId, {
        title: title,
        content: content,
      }).then(function (data) {
        if (!data._ok) throw new Error(data.error || 'Failed to update page');
        state.isEditing = false;
        state.currentPageContent = content;
        loadPages();
      });
    }

    promise.catch(function (err) {
      setEditorStatus('Error: ' + err.message, 'error');
    }).then(function () {
      el.savePageBtn.disabled = false;
    });
  }

  function cancelEdit() {
    if (el.editorContent.value || el.editorTitle.value) {
      confirmDialog('Discard Changes', 'Are you sure you want to discard your changes?', 'Discard', 'btn-danger', function () {
        finishCancel();
      });
    } else {
      finishCancel();
    }
  }

  function finishCancel() {
    state.isEditing = false;
    state.isNewPage = false;
    if (state.currentPageId && state.pagesMap[state.currentPageId]) {
      loadAndShowPage(state.currentPageId);
    } else {
      showContentEmpty();
    }
  }

  function deletePage(pageId) {
    var page = state.pagesMap[pageId];
    if (!page) return;

    var hasChildren = state.pages.some(function (p) { return p.parentId === pageId; });
    if (hasChildren) {
      confirmDialog('Cannot Delete', 'This page has sub-pages. Please delete or move them first.', 'OK', 'btn-primary', function () {});
      return;
    }

    confirmDialog('Delete Page', 'Are you sure you want to delete "' + escapeHtml(page.title) + '"? This cannot be undone.', 'Delete', 'btn-danger', function () {
      api.deletePage(pageId).then(function (data) {
        if (!data._ok) { alert('Delete failed: ' + (data.error || 'Unknown error')); return; }
        if (state.currentPageId === pageId) {
          state.currentPageId = null;
          showContentEmpty();
        }
        loadPages();
      }).catch(function (err) {
        alert('Delete failed: ' + err.message);
      });
    });
  }

  function setEditorStatus(msg, type) {
    el.editorStatus.textContent = msg;
    el.editorStatus.className = 'editor-status' + (type ? ' ' + type : '');
  }

  // ============================================================
  // Editor Toolbar
  // ============================================================
  function handleToolbarAction(action) {
    var ta = el.editorContent;
    if (ta.style.display === 'none') return;

    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    var text = ta.value;
    var selected = text.substring(start, end);
    var insert = '';
    var cursorOffset = 0;

    switch (action) {
      case 'bold':
        insert = '**' + (selected || 'bold text') + '**';
        cursorOffset = selected ? insert.length : 2;
        break;
      case 'italic':
        insert = '*' + (selected || 'italic text') + '*';
        cursorOffset = selected ? insert.length : 1;
        break;
      case 'heading':
        insert = '## ' + (selected || 'Heading');
        cursorOffset = insert.length;
        break;
      case 'link':
        insert = selected ? '[' + selected + '](url)' : '[link text](url)';
        cursorOffset = selected ? insert.length - 1 : 1;
        break;
      case 'image':
        insert = '![' + (selected || 'alt text') + '](image-url)';
        cursorOffset = insert.length - 1;
        break;
      case 'upload':
        el.imageUploadInput.click();
        return;
      case 'code':
        if (selected && selected.indexOf('\n') !== -1) {
          insert = '```\n' + selected + '\n```';
        } else {
          insert = '`' + (selected || 'code') + '`';
        }
        cursorOffset = insert.length;
        break;
      case 'ulist':
        insert = selected ? selected.split('\n').map(function (l) { return '- ' + l; }).join('\n') : '- ';
        cursorOffset = insert.length;
        break;
      case 'olist':
        insert = selected ? selected.split('\n').map(function (l, i) { return (i + 1) + '. ' + l; }).join('\n') : '1. ';
        cursorOffset = insert.length;
        break;
      case 'quote':
        insert = selected ? selected.split('\n').map(function (l) { return '> ' + l; }).join('\n') : '> ';
        cursorOffset = insert.length;
        break;
      case 'table':
        insert = '| Header 1 | Header 2 | Header 3 |\n| --- | --- | --- |\n| Cell 1 | Cell 2 | Cell 3 |';
        cursorOffset = insert.length;
        break;
      case 'hr':
        insert = '\n---\n';
        cursorOffset = insert.length;
        break;
      case 'preview':
        togglePreview();
        return;
      default:
        return;
    }

    ta.value = text.substring(0, start) + insert + text.substring(end);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = start + cursorOffset;
  }

  function togglePreview() {
    var showing = el.editorPreview.style.display !== 'none';
    if (showing) {
      el.editorPreview.style.display = 'none';
      el.editorContent.style.display = '';
      el.previewToggle.innerHTML = '<span class="glyphicon glyphicon-eye-open"></span> Preview';
    } else {
      el.editorPreview.innerHTML = renderMarkdown(el.editorContent.value);
      el.editorPreview.style.display = '';
      el.editorContent.style.display = 'none';
      el.previewToggle.innerHTML = '<span class="glyphicon glyphicon-pencil"></span> Edit';
    }
  }

  // ============================================================
  // Image Upload
  // ============================================================
  function handleImageUpload(file) {
    if (!file || !file.type.startsWith('image/')) {
      setEditorStatus('Please select an image file.', 'error');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setEditorStatus('Image too large (max 3 MB).', 'error');
      return;
    }

    setEditorStatus('Uploading\u2026');

    var reader = new FileReader();
    reader.onload = function () {
      var base64 = reader.result.split(',')[1];
      api.uploadImage(file.name, base64).then(function (data) {
        if (!data._ok) throw new Error(data.error || 'Upload failed');
        // Insert markdown image
        var ta = el.editorContent;
        if (ta.style.display === 'none') togglePreview();
        var pos = ta.selectionStart;
        var md = '\n![' + file.name + '](' + data.url + ')\n';
        ta.value = ta.value.substring(0, pos) + md + ta.value.substring(pos);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = pos + md.length;
        setEditorStatus('Image uploaded!', 'success');
        setTimeout(function () { setEditorStatus(''); }, 3000);
      }).catch(function (err) {
        setEditorStatus('Upload failed: ' + err.message, 'error');
      });
    };
    reader.readAsDataURL(file);
  }

  // ============================================================
  // Admin Panel
  // ============================================================
  function openAdmin() {
    loadUsers();
    jQuery('#admin-modal').modal('show');
  }

  function loadUsers() {
    api.getUsers().then(function (data) {
      if (!data._ok) {
        el.usersList.innerHTML = '<span class="text-danger">Failed to load users.</span>';
        return;
      }
      var users = data.users;
      var keys = Object.keys(users).sort(function (a, b) {
        var ra = users[a].role === 'admin' ? 0 : users[a].role === 'editor' ? 1 : users[a].role === 'viewer' ? 2 : 3;
        var rb = users[b].role === 'admin' ? 0 : users[b].role === 'editor' ? 1 : users[b].role === 'viewer' ? 2 : 3;
        return ra - rb || a.localeCompare(b);
      });

      if (keys.length === 0) {
        el.usersList.innerHTML = '<span class="text-muted-sm">No users.</span>';
        return;
      }

      var html = '';
      keys.forEach(function (key) {
        var u = users[key];
        var isCurrentUser = key === state.user.login.toLowerCase();
        var roleLabel = u.role === 'pending' ? '<span class="label label-warning">pending</span> ' : '';
        html += '<div class="admin-user-row">' +
          (u.avatar ? '<img src="' + escapeHtml(u.avatar) + '" style="width:24px;height:24px;border-radius:50%;">' : '') +
          '<div>' +
          '<div class="user-email">' + roleLabel + escapeHtml(key) + '</div>' +
          '<div class="user-display-name">' + escapeHtml(u.displayName || '') + '</div>' +
          '</div>' +
          '<select class="form-control" data-user-role="' + escapeHtml(key) + '"' +
            (isCurrentUser ? ' disabled title="Cannot change own role"' : '') + '>' +
          '<option value="pending"' + (u.role === 'pending' ? ' selected' : '') + '>Pending</option>' +
          '<option value="viewer"' + (u.role === 'viewer' ? ' selected' : '') + '>Viewer</option>' +
          '<option value="editor"' + (u.role === 'editor' ? ' selected' : '') + '>Editor</option>' +
          '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>Admin</option>' +
          '</select>' +
          (!isCurrentUser ?
            '<button class="btn btn-xs btn-danger" data-delete-user="' + escapeHtml(key) + '" title="Remove user">' +
            '<span class="glyphicon glyphicon-remove"></span></button>' : '') +
          '</div>';
      });
      el.usersList.innerHTML = html;

      // Bind role change
      el.usersList.querySelectorAll('[data-user-role]').forEach(function (sel) {
        sel.addEventListener('change', function () {
          var login = this.getAttribute('data-user-role');
          var newRole = this.value;
          api.updateUserRole(login, newRole).then(function (data) {
            if (!data._ok) { alert('Failed: ' + (data.error || 'Unknown error')); loadUsers(); return; }
            sel.style.borderColor = '#5cb85c';
            setTimeout(function () { sel.style.borderColor = ''; }, 1500);
          });
        });
      });

      // Bind delete
      el.usersList.querySelectorAll('[data-delete-user]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var login = this.getAttribute('data-delete-user');
          confirmDialog('Remove User', 'Remove "' + login + '" from the wiki?', 'Remove', 'btn-danger', function () {
            api.removeUser(login).then(function () { loadUsers(); });
          });
        });
      });
    });
  }

  function addUser() {
    var login = el.addUserLogin.value.trim();
    var role = el.addUserRole.value;
    if (!login) {
      el.addUserStatus.innerHTML = '<span class="text-danger">Enter a GitHub username.</span>';
      return;
    }
    el.addUserBtn.disabled = true;
    api.addUser(login, role).then(function (data) {
      if (!data._ok) throw new Error(data.error || 'Failed');
      el.addUserLogin.value = '';
      el.addUserStatus.innerHTML = '<span class="text-success">Added ' + escapeHtml(login) + ' as ' + role + '!</span>';
      loadUsers();
      setTimeout(function () { el.addUserStatus.innerHTML = ''; }, 4000);
    }).catch(function (err) {
      el.addUserStatus.innerHTML = '<span class="text-danger">' + escapeHtml(err.message) + '</span>';
    }).then(function () {
      el.addUserBtn.disabled = false;
    });
  }

  // ============================================================
  // Confirm Dialog
  // ============================================================
  function confirmDialog(title, message, confirmText, confirmClass, onConfirm) {
    var overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML =
      '<div class="confirm-dialog">' +
      '<h4>' + escapeHtml(title) + '</h4>' +
      '<p>' + message + '</p>' +
      '<div class="confirm-actions">' +
      '<button class="btn btn-default cancel-btn">Cancel</button>' +
      '<button class="btn ' + (confirmClass || 'btn-primary') + ' confirm-btn">' + escapeHtml(confirmText) + '</button>' +
      '</div></div>';

    var destroy = function () { overlay.remove(); };
    overlay.querySelector('.cancel-btn').addEventListener('click', destroy);
    overlay.querySelector('.confirm-btn').addEventListener('click', function () { destroy(); onConfirm(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) destroy(); });
    el.confirmContainer.appendChild(overlay);
  }

  // ============================================================
  // Utilities
  // ============================================================
  function escapeHtml(s) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(s || ''));
    return div.innerHTML;
  }

  // ============================================================
  // Event Binding
  // ============================================================
  function bindEvents() {
    el.editPageBtn.addEventListener('click', startEdit);
    el.addChildBtn.addEventListener('click', function () { startNewPage(state.currentPageId); });
    el.deletePageBtn.addEventListener('click', function () { deletePage(state.currentPageId); });
    el.newRootPage.addEventListener('click', function () { startNewPage(null); });
    el.savePageBtn.addEventListener('click', savePage);
    el.cancelEditBtn.addEventListener('click', cancelEdit);

    // Toolbar
    document.querySelectorAll('.editor-toolbar .btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = this.getAttribute('data-action');
        if (action) handleToolbarAction(action);
      });
    });

    // Tab in editor
    el.editorContent.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        var s = e.target.selectionStart;
        e.target.value = e.target.value.substring(0, s) + '  ' + e.target.value.substring(e.target.selectionEnd);
        e.target.selectionStart = e.target.selectionEnd = s + 2;
      }
    });

    // Ctrl+S
    el.editorContent.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); savePage(); }
    });

    // Image upload
    el.imageUploadInput.addEventListener('change', function () {
      if (this.files && this.files[0]) { handleImageUpload(this.files[0]); this.value = ''; }
    });
    el.editorContent.addEventListener('dragover', function (e) { e.preventDefault(); });
    el.editorContent.addEventListener('drop', function (e) {
      e.preventDefault();
      var files = e.dataTransfer.files;
      if (files && files[0] && files[0].type.startsWith('image/')) handleImageUpload(files[0]);
    });

    // Search
    el.pageSearch.addEventListener('input', function () {
      state.searchQuery = this.value.trim();
      renderTree();
    });

    // Admin
    el.adminBtn.addEventListener('click', openAdmin);
    el.addUserBtn.addEventListener('click', addUser);

    // Breadcrumb clicks
    el.contentBreadcrumb.addEventListener('click', function (e) {
      if (e.target.tagName === 'A' && e.target.hasAttribute('data-breadcrumb-id')) {
        e.preventDefault();
        selectPage(e.target.getAttribute('data-breadcrumb-id'));
      }
    });

    // Mobile sidebar toggle
    el.mobileToggle.addEventListener('click', function () {
      el.resourcesSidebar.classList.toggle('collapsed');
    });
    function checkMobile() {
      if (window.innerWidth <= 768) {
        el.mobileToggle.style.display = '';
        el.resourcesSidebar.classList.add('collapsed');
      } else {
        el.mobileToggle.style.display = 'none';
        el.resourcesSidebar.classList.remove('collapsed');
      }
    }
    window.addEventListener('resize', checkMobile);
    checkMobile();
  }

  // ============================================================
  // Init
  // ============================================================
  function init() {
    cacheElements();
    bindEvents();
    checkAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
