const year = document.getElementById('nfYear');
const path = document.getElementById('nfPath');
if (year) year.textContent = new Date().getFullYear();
if (path) path.textContent = window.location.pathname;
