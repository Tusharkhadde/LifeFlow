javascript:void(function(){
  var url=encodeURIComponent(window.location.href);
  var title=encodeURIComponent(document.title);
  var api=prompt('LifeFlow API URL (e.g. https://your-app.vercel.app):');
  if(!api)return;
  fetch(api+'/api/knowledge',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({input:decodeURIComponent(url)})})
    .then(function(r){return r.json()})
    .then(function(d){alert(d.item?'Saved: '+d.item.title:d.error||'Saved!')})
    .catch(function(){alert('Save failed. Make sure you are logged in.')});
})();
