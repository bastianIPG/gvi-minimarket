/**
 * Lógica de Clima y Ubicación para GVI
 */

async function cargarClima() {
    const lat = localStorage.getItem('gvi_lat') || -36.6155;
    const lon = localStorage.getItem('gvi_lon') || -72.9561;
    const ciudad = localStorage.getItem('gvi_ciudad_nombre') || "Tomé";

    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const datos = await res.json();
        const temp = Math.round(datos.current_weather.temperature);
        const deDia = datos.current_weather.is_day;
        
        const iconos = { 
            0: deDia ? '☀️' : '🌙', 1: deDia ? '🌤️' : '☁️', 2: deDia ? '🌤️' : '☁️',
            3: '☁️', 45: '🌫️', 51: '🌧️', 61: '🌧️', 71: '❄️', 95: '⚡' 
        };

        document.getElementById('wClimaTemp').innerText = `${temp}°C`;
        document.getElementById('wClimaIcon').innerText = iconos[datos.current_weather.weathercode] || '☁️';
        document.getElementById('wCiudadLabel').innerText = ciudad.toUpperCase();
    } catch (e) { 
        console.error("Error clima"); 
    }
}

async function obtenerSugerencias(texto) {
    if (texto.length < 3) return;
    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(texto)}&count=5&language=es`);
        const data = await res.json();
        const datalist = document.getElementById('listaSugerencias');
        datalist.innerHTML = ""; 
        if (data.results) {
            data.results.forEach(lugar => {
                const option = document.createElement('option');
                option.value = `${lugar.name}, ${lugar.country}`;
                datalist.appendChild(option);
            });
        }
    } catch (e) { 
        console.error("Error sugerencias"); 
    }
}

/**
 * Función disparada por el ENTER.
 * Solo busca la ciudad y mueve el mapa para que el usuario la vea.
 */
async function buscarCoordenadas() {
    const input = document.getElementById('inputNuevaCiudad');
    const nombre = input.value.trim();

    if (!nombre || nombre === "Ubicación detectada") return;

    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nombre)}&count=1&language=es`);
        const data = await res.json();

        if (data.results && data.results.length > 0) {
            const u = data.results[0];

            // 1. Mueve el mapa y el clip
            if (typeof mapa !== 'undefined') {
                mapa.setView([u.latitude, u.longitude], 13);
                marker.setLatLng([u.latitude, u.longitude]);
            }

            // 2. Anota los datos para cuando le dé a Guardar
            input.dataset.lat = u.latitude;
            input.dataset.lon = u.longitude;
            input.dataset.name = u.name;
        } else {
            alert("No encontramos esa ciudad. Intenta ser más específico.");
        }
    } catch (e) {
        console.error("Error al buscar coordenadas:", e);
    }
}

/**
 * Función central de guardado (Al hacer click en el botón azul)
 */
async function buscarYGuardarCiudad() {
    const input = document.getElementById('inputNuevaCiudad');
    const valor = input.value.trim();

    // ESCENARIO 1: Ya tenemos las coordenadas (Porque dio Enter, pinchó el mapa o usó GPS)
    if (input.dataset.lat && input.dataset.lon) {
        let nombreFinal = input.dataset.name || "Ubicación";
        if (valor !== "Ubicación detectada" && valor !== "") {
            nombreFinal = valor; // Respetamos lo que escribió si no es GPS
        }
        guardarYRefrescar(input.dataset.lat, input.dataset.lon, nombreFinal);
        return;
    }

    // ESCENARIO 2: No dio Enter, solo escribió algo y le dio directo a Guardar
    if (valor) {
        try {
            const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(valor)}&count=1&language=es`);
            const data = await res.json();

            if (data.results && data.results.length > 0) {
                const u = data.results[0];
                guardarYRefrescar(u.latitude, u.longitude, u.name);
            } else {
                alert("No se encontró esa ciudad. Intenta otra o pincha el mapa.");
            }
        } catch (e) {
            alert("Error de conexión");
        }
        return;
    }

    // ESCENARIO 3: Le dio a Guardar con el cuadro vacío y sin pinchar el mapa
    alert("Escribe una ciudad o pincha el mapa antes de guardar.");
}

/**
 * Función auxiliar para limpiar el código (Guarda, cierra el modal y actualiza el clima)
 */
function guardarYRefrescar(lat, lon, nombre) {
    const input = document.getElementById('inputNuevaCiudad');

    localStorage.setItem('gvi_lat', lat);
    localStorage.setItem('gvi_lon', lon);
    localStorage.setItem('gvi_ciudad_nombre', nombre);

    document.getElementById('modalCambiarCiudad').style.display = 'none';
    cargarClima();

    // Limpiamos los datos residuales
    input.value = "";
    delete input.dataset.lat;
    delete input.dataset.lon;
    delete input.dataset.name;
}

document.addEventListener('DOMContentLoaded', cargarClima);