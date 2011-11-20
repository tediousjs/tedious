$(document).ready(function() {
  var defaultPage = 'overview';

  cleanCodeWhitespace();  
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
      page = defaultPage;
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
  
  function cleanCodeWhitespace() {
    $('pre.code code').each(function() {
      var code = $(this).text();
    
      code = $.trim(code);
      $(this).text(code);
    });
  }
});
