$(document).ready(function() {
  showPageForHash();

  window.onhashchange = function() {
    showPageForHash();
  }

  function showPageForHash() {
    var page = window.location.hash;
    
    if (page) {
      page = page.substring(1);
    }
    
    if (!page) {
      page = 'overview'
    }
    
    showPage(page);
  }

  function showPage(pageName) {
    // Show the page.    
    $('#content .page').hide();
    $('#content .page.' + pageName).show();
    
    // Set the URL hash fragment.
    window.location.hash = pageName;
  }
});
