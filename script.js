// Configuración
const MAX_MESAS_POR_TURNO = 15;

// Estado de la aplicación
let reservations = JSON.parse(localStorage.getItem('sucotReservations')) || {
    manana: [],
    tarde: [],
    noche: []
};

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    updateAvailability();
    displayReservations();

    document.getElementById('bookingForm').addEventListener('submit', handleBooking);
});

// Manejar nueva reserva
function handleBooking(e) {
    e.preventDefault();

    const turno = document.getElementById('turno').value;
    const depto = document.getElementById('depto').value.trim();
    const personas = parseInt(document.getElementById('personas').value);

    // Validar disponibilidad
    if (reservations[turno].length >= MAX_MESAS_POR_TURNO) {
        showNotification('Lo sentimos, no hay mesas disponibles para este turno', 'error');
        return;
    }

    // Verificar si el departamento ya tiene reserva en este turno
    const deptoExiste = reservations[turno].some(r => r.depto.toLowerCase() === depto.toLowerCase());
    if (deptoExiste) {
        showNotification('Este departamento ya tiene una reserva en este turno', 'warning');
        return;
    }

    // Crear reserva
    const reservation = {
        id: Date.now(),
        turno,
        depto,
        personas,
        fecha: new Date().toLocaleString('es-ES')
    };

    reservations[turno].push(reservation);
    saveReservations();
    updateAvailability();
    displayReservations();

    // Limpiar formulario
    document.getElementById('bookingForm').reset();

    showNotification('¡Reserva realizada con éxito!', 'success');
}

// Eliminar reserva
function deleteReservation(id, turno) {
    if (confirm('¿Está seguro de que desea cancelar esta reserva?')) {
        reservations[turno] = reservations[turno].filter(r => r.id !== id);
        saveReservations();
        updateAvailability();
        displayReservations();
        showNotification('Reserva cancelada', 'success');
    }
}

// Actualizar disponibilidad
function updateAvailability() {
    const turnos = ['manana', 'tarde', 'noche'];

    turnos.forEach(turno => {
        const ocupadas = reservations[turno].length;
        const disponibles = MAX_MESAS_POR_TURNO - ocupadas;
        const porcentaje = (ocupadas / MAX_MESAS_POR_TURNO) * 100;

        // Actualizar números
        document.getElementById(`${turno}-disponibles`).textContent = disponibles;

        // Actualizar color según disponibilidad
        const disponiblesElement = document.getElementById(`${turno}-disponibles`);
        if (disponibles === 0) {
            disponiblesElement.style.color = '#dc3545';
        } else if (disponibles <= 5) {
            disponiblesElement.style.color = '#ffc107';
        } else {
            disponiblesElement.style.color = '#28a745';
        }

        // Actualizar barra de progreso
        const progressFill = document.getElementById(`${turno}-progress`);
        progressFill.style.width = `${porcentaje}%`;

        if (porcentaje >= 80) {
            progressFill.style.background = 'linear-gradient(90deg, #dc3545 0%, #c82333 100%)';
        } else if (porcentaje >= 50) {
            progressFill.style.background = 'linear-gradient(90deg, #ffc107 0%, #ff9800 100%)';
        } else {
            progressFill.style.background = 'linear-gradient(90deg, #28a745 0%, #20c997 100%)';
        }
    });
}

// Mostrar reservas
function displayReservations() {
    const container = document.getElementById('reservationsList');

    // Combinar todas las reservas y ordenar por turno
    const todasLasReservas = [
        ...reservations.manana.map(r => ({...r, turnoNombre: 'Mañana'})),
        ...reservations.tarde.map(r => ({...r, turnoNombre: 'Tarde'})),
        ...reservations.noche.map(r => ({...r, turnoNombre: 'Noche'}))
    ];

    if (todasLasReservas.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No hay reservas aún</p>';
        return;
    }

    // Ordenar por turno (mañana, tarde, noche)
    const ordenTurnos = { manana: 1, tarde: 2, noche: 3 };
    todasLasReservas.sort((a, b) => ordenTurnos[a.turno] - ordenTurnos[b.turno]);

    container.innerHTML = todasLasReservas.map(r => `
        <div class="reservation-item">
            <div class="reservation-info">
                <strong>${getTurnoEmoji(r.turno)} ${r.turnoNombre}</strong> -
                Depto: <strong>${r.depto}</strong> -
                Personas: <strong>${r.personas}</strong>
                <div style="font-size: 0.9em; color: #666; margin-top: 5px;">
                    Reservado: ${r.fecha}
                </div>
            </div>
            <button class="btn-delete" onclick="deleteReservation(${r.id}, '${r.turno}')">
                Cancelar
            </button>
        </div>
    `).join('');
}

// Obtener emoji según turno
function getTurnoEmoji(turno) {
    const emojis = {
        manana: '🌅',
        tarde: '☀️',
        noche: '🌙'
    };
    return emojis[turno] || '📅';
}

// Guardar en localStorage
function saveReservations() {
    localStorage.setItem('sucotReservations', JSON.stringify(reservations));
}

// Mostrar notificación
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;

    // Mostrar
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);

    // Ocultar después de 3 segundos
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Función para resetear todas las reservas (útil para desarrollo)
function resetReservations() {
    if (confirm('¿Está seguro de que desea eliminar TODAS las reservas?')) {
        reservations = {
            manana: [],
            tarde: [],
            noche: []
        };
        saveReservations();
        updateAvailability();
        displayReservations();
        showNotification('Todas las reservas han sido eliminadas', 'success');
    }
}

// Exportar para uso en consola
window.resetReservations = resetReservations;