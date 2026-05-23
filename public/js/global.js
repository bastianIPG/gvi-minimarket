function actualizarRelojGlobal() {
    const reloj = document.getElementById('relojGlobal');
    if (reloj) {
        reloj.innerText = new Date().toLocaleTimeString('es-CL');
    }
}

function toggleTema() {
    const body = document.body;
    body.classList.toggle('dark-mode');
    const esOscuro = body.classList.contains('dark-mode');
    localStorage.setItem('temaGVI', esOscuro ? 'oscuro' : 'claro');
    actualizarIconoTema(esOscuro);
}

function actualizarIconoTema(esOscuro) {
    const btn = document.getElementById('btnTema');
    if (btn) btn.innerText = esOscuro ? '☀️' : '🌙';
}

// Al cargar cualquier página
document.addEventListener('DOMContentLoaded', () => {
    // 1. Iniciamos el reloj y lo dejamos corriendo
    actualizarRelojGlobal(); 
    setInterval(actualizarRelojGlobal, 1000);

    // 2. Revisamos si el usuario prefiere el modo oscuro
    if (localStorage.getItem('temaGVI') === 'oscuro') {
        document.body.classList.add('dark-mode');
        actualizarIconoTema(true);
    }
});

// Dentro de tu función toggleTema()
function toggleTema() {
    const body = document.body;
    body.classList.toggle('dark-mode');
    const esOscuro = body.classList.contains('dark-mode');
    localStorage.setItem('temaGVI', esOscuro ? 'oscuro' : 'claro');
    // Sincronizar el checkbox por si acaso
    const check = document.getElementById('checkTema');
    if(check) check.checked = esOscuro;
}

// Dentro del DOMContentLoaded de global.js, agrega esto:
const esOscuro = localStorage.getItem('temaGVI') === 'oscuro';
const check = document.getElementById('checkTema');
if(check) check.checked = esOscuro;