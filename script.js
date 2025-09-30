// Configuración
const MAX_MESAS_POR_TURNO = 15;
const ADMIN_PASSWORD = 'avivia2025'; // Cambiar esta contraseña

// Estado de la aplicación
let reservations = JSON.parse(localStorage.getItem('sucotReservations')) || {
    manana: [],
    tarde: [],
    noche: []
};

let isAdminLoggedIn = false;

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    updateAvailability();
    displayReservations();

    document.getElementById('bookingForm').addEventListener('submit', handleBooking);
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
});

// Manejar nueva reserva
function handleBooking(e) {
    e.preventDefault();

    const fecha = document.getElementById('fecha').value;
    const turno = document.getElementById('turno').value;
    const nombre = document.getElementById('nombre').value.trim();
    const depto = document.getElementById('depto').value.trim();
    const telefono = document.getElementById('telefono').value.trim();
    const personas = parseInt(document.getElementById('personas').value);

    // Validaciones adicionales
    if (nombre.length < 3) {
        showNotification('El nombre debe tener al menos 3 caracteres', 'error');
        return;
    }

    if (!telefono.match(/[0-9\-\+\(\)\s]+/)) {
        showNotification('Teléfono inválido', 'error');
        return;
    }

    // Crear clave única para fecha+turno
    const key = `${fecha}-${turno}`;
    if (!reservations[key]) {
        reservations[key] = [];
    }

    // Validar disponibilidad
    if (reservations[key].length >= MAX_MESAS_POR_TURNO) {
        showNotification('Lo sentimos, no hay mesas disponibles para este turno', 'error');
        return;
    }

    // Verificar si el departamento ya tiene reserva en este turno
    const deptoExiste = reservations[key].some(r => r.depto.toLowerCase() === depto.toLowerCase());
    if (deptoExiste) {
        showNotification('Este departamento ya tiene una reserva en este turno y día', 'warning');
        return;
    }

    // Crear reserva
    const reservation = {
        id: Date.now(),
        fecha,
        turno,
        nombre,
        depto,
        telefono,
        personas,
        fechaReserva: new Date().toLocaleString('es-ES')
    };

    reservations[key].push(reservation);
    saveReservations();
    updateAvailability();
    displayReservations();

    // Generar código de confirmación
    const confirmationCode = `AV${reservation.id.toString().slice(-6)}`;

    // Mostrar confirmación detallada
    showConfirmationBox(reservation, confirmationCode, key);

    // Limpiar formulario
    document.getElementById('bookingForm').reset();

    showNotification('¡Reserva realizada con éxito! 🎉', 'success');
}

// Mostrar caja de confirmación
function showConfirmationBox(reservation, code, key) {
    const box = document.getElementById('confirmationBox');
    const details = document.getElementById('confirmationDetails');
    const codeElement = document.getElementById('confirmationCode');

    details.innerHTML = `
        <p><strong>Nombre:</strong> ${reservation.nombre}</p>
        <p><strong>Fecha:</strong> ${formatFecha(reservation.fecha)}</p>
        <p><strong>Turno:</strong> ${getTurnoEmoji(reservation.turno)} ${getTurnoNombre(reservation.turno)}</p>
        <p><strong>Departamento:</strong> ${reservation.depto}</p>
        <p><strong>Personas:</strong> ${reservation.personas}</p>
        <p><strong>Teléfono:</strong> ${reservation.telefono}</p>
    `;
    codeElement.textContent = code;

    box.style.display = 'block';
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Cerrar confirmación
function closeConfirmation() {
    document.getElementById('confirmationBox').style.display = 'none';
}

// Eliminar reserva
function deleteReservation(id, key) {
    if (confirm('¿Está seguro de que desea cancelar esta reserva?')) {
        reservations[key] = reservations[key].filter(r => r.id !== id);
        if (reservations[key].length === 0) {
            delete reservations[key];
        }
        saveReservations();
        updateAvailability();
        displayReservations();
        if (isAdminLoggedIn) {
            displayAdminReservations();
        }
        showNotification('Reserva cancelada', 'success');
    }
}

// Actualizar disponibilidad
function updateAvailability() {
    const turnos = ['manana', 'tarde', 'noche'];

    turnos.forEach(turno => {
        // Contar reservas para este turno en todas las fechas
        let ocupadas = 0;
        Object.keys(reservations).forEach(key => {
            if (key.includes(turno)) {
                ocupadas += reservations[key].length;
            }
        });

        const disponibles = MAX_MESAS_POR_TURNO - (ocupadas % MAX_MESAS_POR_TURNO);
        const porcentaje = ((ocupadas % MAX_MESAS_POR_TURNO) / MAX_MESAS_POR_TURNO) * 100;

        // Actualizar números
        const element = document.getElementById(`${turno}-disponibles`);
        if (element) {
            element.textContent = disponibles;

            // Actualizar color según disponibilidad
            if (disponibles === 0) {
                element.style.color = '#dc3545';
            } else if (disponibles <= 5) {
                element.style.color = '#ffc107';
            } else {
                element.style.color = '#28a745';
            }
        }

        // Actualizar barra de progreso
        const progressFill = document.getElementById(`${turno}-progress`);
        if (progressFill) {
            progressFill.style.width = `${porcentaje}%`;

            if (porcentaje >= 80) {
                progressFill.style.background = 'linear-gradient(90deg, #dc3545 0%, #c82333 100%)';
            } else if (porcentaje >= 50) {
                progressFill.style.background = 'linear-gradient(90deg, #ffc107 0%, #ff9800 100%)';
            } else {
                progressFill.style.background = 'linear-gradient(90deg, #28a745 0%, #20c997 100%)';
            }
        }
    });
}

// Mostrar reservas
function displayReservations() {
    const container = document.getElementById('reservationsList');
    if (!container) return;

    // Combinar todas las reservas
    const todasLasReservas = [];
    Object.keys(reservations).forEach(key => {
        reservations[key].forEach(r => {
            todasLasReservas.push({
                ...r,
                key,
                turnoNombre: getTurnoNombre(r.turno),
                fechaNombre: formatFecha(r.fecha)
            });
        });
    });

    if (todasLasReservas.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No hay reservas aún</p>';
        return;
    }

    // Ordenar por fecha y turno
    todasLasReservas.sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
        const ordenTurnos = { manana: 1, tarde: 2, noche: 3 };
        return ordenTurnos[a.turno] - ordenTurnos[b.turno];
    });

    // Mostrar solo las últimas 10 reservas
    const recentReservas = todasLasReservas.slice(-10);

    container.innerHTML = recentReservas.map(r => `
        <div class="reservation-item">
            <div class="reservation-info">
                <strong>${r.nombre || 'Sin nombre'}</strong> -
                <strong>${r.fechaNombre}</strong> -
                <strong>${getTurnoEmoji(r.turno)} ${r.turnoNombre}</strong><br>
                Depto: <strong>${r.depto}</strong> -
                Personas: <strong>${r.personas}</strong>
                ${r.telefono ? ` - Tel: ${r.telefono}` : ''}
                <div style="font-size: 0.9em; color: #666; margin-top: 5px;">
                    Reservado: ${r.fechaReserva}
                </div>
            </div>
            <button class="btn-delete" onclick="deleteReservation(${r.id}, '${r.key}')">
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

// Obtener nombre de turno
function getTurnoNombre(turno) {
    const nombres = {
        manana: 'Mañana',
        tarde: 'Tarde',
        noche: 'Noche'
    };
    return nombres[turno] || turno;
}

// Formatear fecha
function formatFecha(fecha) {
    const fechas = {
        '2025-10-06': 'Lun 6 Oct',
        '2025-10-07': 'Mar 7 Oct',
        '2025-10-08': 'Mié 8 Oct',
        '2025-10-09': 'Jue 9 Oct',
        '2025-10-10': 'Vie 10 Oct',
        '2025-10-11': 'Sáb 11 Oct',
        '2025-10-12': 'Dom 12 Oct',
        '2025-10-13': 'Lun 13 Oct'
    };
    return fechas[fecha] || fecha;
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

// === FUNCIONES DE ADMINISTRACIÓN ===

// Abrir modal de login
function openLoginModal() {
    document.getElementById('loginModal').classList.add('show');
}

// Cerrar modal de login
function closeLoginModal() {
    document.getElementById('loginModal').classList.remove('show');
    document.getElementById('adminPassword').value = '';
}

// Manejar login
function handleLogin(e) {
    e.preventDefault();
    const password = document.getElementById('adminPassword').value;

    if (password === ADMIN_PASSWORD) {
        isAdminLoggedIn = true;
        closeLoginModal();
        showAdminPanel();
        showNotification('Acceso concedido', 'success');
    } else {
        showNotification('Contraseña incorrecta', 'error');
    }
}

// Mostrar panel de administración
function showAdminPanel() {
    document.getElementById('mainContainer').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    updateAdminStats();
    displayAdminReservations();
}

// Cerrar sesión
function logout() {
    isAdminLoggedIn = false;
    document.getElementById('mainContainer').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
    showNotification('Sesión cerrada', 'success');
}

// Actualizar estadísticas de admin
function updateAdminStats() {
    let totalReservas = 0;
    let totalPersonas = 0;
    let countManana = 0;
    let countTarde = 0;
    let countNoche = 0;

    Object.keys(reservations).forEach(key => {
        const turno = key.split('-').pop();
        totalReservas += reservations[key].length;

        reservations[key].forEach(r => {
            totalPersonas += r.personas;
            if (turno === 'manana') countManana++;
            else if (turno === 'tarde') countTarde++;
            else if (turno === 'noche') countNoche++;
        });
    });

    document.getElementById('adminTotalReservas').textContent = totalReservas;
    document.getElementById('adminTotalPersonas').textContent = totalPersonas;
    document.getElementById('adminManana').textContent = countManana;
    document.getElementById('adminTarde').textContent = countTarde;
    document.getElementById('adminNoche').textContent = countNoche;
}

// Variable global para filtros
let currentFilters = {
    fecha: '',
    turno: '',
    search: ''
};

// Mostrar todas las reservas en admin
function displayAdminReservations(filteredReservations = null) {
    const container = document.getElementById('adminReservationsList');

    // Combinar todas las reservas
    let todasLasReservas = [];

    if (filteredReservations) {
        todasLasReservas = filteredReservations;
    } else {
        Object.keys(reservations).forEach(key => {
            reservations[key].forEach(r => {
                todasLasReservas.push({
                    ...r,
                    key,
                    turnoNombre: getTurnoNombre(r.turno),
                    fechaNombre: formatFecha(r.fecha)
                });
            });
        });
    }

    // Actualizar contador
    document.getElementById('reservationCount').textContent = todasLasReservas.length;

    if (todasLasReservas.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No hay reservas</p>';
        return;
    }

    // Ordenar por fecha y turno
    todasLasReservas.sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
        const ordenTurnos = { manana: 1, tarde: 2, noche: 3 };
        return ordenTurnos[a.turno] - ordenTurnos[b.turno];
    });

    container.innerHTML = todasLasReservas.map(r => `
        <div class="reservation-item">
            <div class="reservation-info">
                <strong>${r.nombre || 'Sin nombre'}</strong> -
                <strong>${r.fechaNombre}</strong> -
                <strong>${getTurnoEmoji(r.turno)} ${r.turnoNombre}</strong><br>
                Depto: <strong>${r.depto}</strong> -
                Personas: <strong>${r.personas}</strong>
                ${r.telefono ? `<br>Tel: <strong>${r.telefono}</strong>` : ''}
                <div style="font-size: 0.9em; color: #666; margin-top: 5px;">
                    Reservado: ${r.fechaReserva}
                </div>
            </div>
            <button class="btn-delete" onclick="deleteReservation(${r.id}, '${r.key}')">
                Eliminar
            </button>
        </div>
    `).join('');
}

// Filtrar reservas
function filterReservations() {
    currentFilters.fecha = document.getElementById('filterFecha').value;
    currentFilters.turno = document.getElementById('filterTurno').value;
    currentFilters.search = document.getElementById('searchQuery').value.toLowerCase();

    // Obtener todas las reservas
    const todasLasReservas = [];
    Object.keys(reservations).forEach(key => {
        reservations[key].forEach(r => {
            todasLasReservas.push({
                ...r,
                key,
                turnoNombre: getTurnoNombre(r.turno),
                fechaNombre: formatFecha(r.fecha)
            });
        });
    });

    // Aplicar filtros
    let filtered = todasLasReservas;

    if (currentFilters.fecha) {
        filtered = filtered.filter(r => r.fecha === currentFilters.fecha);
    }

    if (currentFilters.turno) {
        filtered = filtered.filter(r => r.turno === currentFilters.turno);
    }

    if (currentFilters.search) {
        filtered = filtered.filter(r =>
            (r.nombre && r.nombre.toLowerCase().includes(currentFilters.search)) ||
            (r.depto && r.depto.toLowerCase().includes(currentFilters.search)) ||
            (r.telefono && r.telefono.includes(currentFilters.search))
        );
    }

    displayAdminReservations(filtered);
}

// Exportar reservas a CSV
function exportReservations() {
    const todasLasReservas = [];
    Object.keys(reservations).forEach(key => {
        reservations[key].forEach(r => {
            todasLasReservas.push({
                ...r,
                fechaNombre: formatFecha(r.fecha),
                turnoNombre: getTurnoNombre(r.turno)
            });
        });
    });

    if (todasLasReservas.length === 0) {
        showNotification('No hay reservas para exportar', 'warning');
        return;
    }

    // Ordenar
    todasLasReservas.sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
        const ordenTurnos = { manana: 1, tarde: 2, noche: 3 };
        return ordenTurnos[a.turno] - ordenTurnos[b.turno];
    });

    // Crear CSV
    let csv = 'Fecha,Turno,Nombre,Departamento,Teléfono,Personas,Fecha Reserva\n';
    todasLasReservas.forEach(r => {
        csv += `${r.fechaNombre},${r.turnoNombre},${r.nombre || 'N/A'},${r.depto},${r.telefono || 'N/A'},${r.personas},${r.fechaReserva}\n`;
    });

    // Descargar
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reservas-succot-avivia-2025-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    showNotification('Exportado con éxito', 'success');
}

// Exportar reservas filtradas
function exportReservationsFiltered() {
    // Obtener todas las reservas
    const todasLasReservas = [];
    Object.keys(reservations).forEach(key => {
        reservations[key].forEach(r => {
            todasLasReservas.push({
                ...r,
                fechaNombre: formatFecha(r.fecha),
                turnoNombre: getTurnoNombre(r.turno)
            });
        });
    });

    // Aplicar filtros
    let filtered = todasLasReservas;

    if (currentFilters.fecha) {
        filtered = filtered.filter(r => r.fecha === currentFilters.fecha);
    }

    if (currentFilters.turno) {
        filtered = filtered.filter(r => r.turno === currentFilters.turno);
    }

    if (currentFilters.search) {
        filtered = filtered.filter(r =>
            (r.nombre && r.nombre.toLowerCase().includes(currentFilters.search)) ||
            (r.depto && r.depto.toLowerCase().includes(currentFilters.search)) ||
            (r.telefono && r.telefono.includes(currentFilters.search))
        );
    }

    if (filtered.length === 0) {
        showNotification('No hay reservas filtradas para exportar', 'warning');
        return;
    }

    // Ordenar
    filtered.sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
        const ordenTurnos = { manana: 1, tarde: 2, noche: 3 };
        return ordenTurnos[a.turno] - ordenTurnos[b.turno];
    });

    // Crear CSV
    let csv = 'Fecha,Turno,Nombre,Departamento,Teléfono,Personas,Fecha Reserva\n';
    filtered.forEach(r => {
        csv += `${r.fechaNombre},${r.turnoNombre},${r.nombre || 'N/A'},${r.depto},${r.telefono || 'N/A'},${r.personas},${r.fechaReserva}\n`;
    });

    // Descargar
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reservas-filtradas-succot-avivia-2025-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    showNotification(`Exportadas ${filtered.length} reservas filtradas`, 'success');
}

// Resetear todas las reservas
function resetReservations() {
    if (confirm('¿Está seguro de que desea eliminar TODAS las reservas? Esta acción no se puede deshacer.')) {
        reservations = {};
        saveReservations();
        updateAvailability();
        displayReservations();
        if (isAdminLoggedIn) {
            updateAdminStats();
            displayAdminReservations();
        }
        showNotification('Todas las reservas han sido eliminadas', 'success');
    }
}