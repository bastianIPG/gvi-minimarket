function actualizarRelojGlobal() {
    const reloj = document.getElementById('relojGlobal');
    if (reloj) {
        reloj.innerText = new Date().toLocaleTimeString('es-CL');
    }
}

function toggleTema() {
    const esOscuro = document.body.classList.contains('dark-mode');
    let nuevoEsOscuro;
    if (typeof gviSetThemePreference === 'function') {
        nuevoEsOscuro = gviSetThemePreference(esOscuro ? 'claro' : 'oscuro');
    } else {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('temaGVI', document.body.classList.contains('dark-mode') ? 'oscuro' : 'claro');
        nuevoEsOscuro = document.body.classList.contains('dark-mode');
    }
    actualizarIconoTema(nuevoEsOscuro);
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

    // 2. Aplicamos el tema del sistema o la preferencia manual.
    const esOscuro = typeof gviApplyTheme === 'function' ? gviApplyTheme() : localStorage.getItem('temaGVI') === 'oscuro';
    if (esOscuro) document.body.classList.add('dark-mode');
    actualizarIconoTema(esOscuro);

    const check = document.getElementById('checkTema');
    if(check) check.checked = esOscuro;
});
