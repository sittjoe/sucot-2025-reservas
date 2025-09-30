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

// Sistema de selección múltiple (reemplaza "carrito")
let selectedReservations = [];

// Perfil de usuario
let userProfile = JSON.parse(localStorage.getItem('userProfile')) || null;

// Horarios disponibles
const HORARIOS = {
    'mediodia': ['12:00-14:00', '14:00-16:00'],
    'noche': ['20:00-21:15', '21:15-22:30']
};

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    generateAvailabilityCalendar();
    loadUserProfile();

    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('fecha').addEventListener('change', updateAvailabilityIndicator);
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

    // Guardar código en la reserva
    reservations[key][reservations[key].length - 1].codigo = confirmationCode;
    saveReservations();

    // Guardar perfil del usuario
    saveUserProfile({ nombre, telefono, depto });

    // Mostrar confirmación detallada
    showConfirmationBox(reservation, confirmationCode, key);

    // Limpiar formulario (excepto datos personales)
    document.getElementById('fecha').value = '';
    document.getElementById('turno').value = '';
    document.getElementById('personas').value = '';

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
    let countTarde = 0;
    let countNoche = 0;

    Object.keys(reservations).forEach(key => {
        totalReservas += reservations[key].length;

        reservations[key].forEach(r => {
            totalPersonas += r.personas;
            // Identificar turno por el horario específico
            if (r.turno.startsWith('12:00') || r.turno.startsWith('14:00')) {
                countTarde++;
            } else if (r.turno.startsWith('20:00') || r.turno.startsWith('21:15')) {
                countNoche++;
            }
        });
    });

    document.getElementById('adminTotalReservas').textContent = totalReservas;
    document.getElementById('adminTotalPersonas').textContent = totalPersonas;
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

// ===== GENERAR CALENDARIO DE DISPONIBILIDAD =====

function generateAvailabilityCalendar() {
    const calendar = document.getElementById('availabilityCalendar');
    const fechas = [
        '2025-10-06', '2025-10-07', '2025-10-08', '2025-10-09',
        '2025-10-10', '2025-10-11', '2025-10-12', '2025-10-13'
    ];

    const todosLosHorarios = [
        { value: '12:00-14:00', label: '12:00-2:00 PM', periodo: 'mediodia' },
        { value: '14:00-16:00', label: '2:00-4:00 PM', periodo: 'mediodia' },
        { value: '20:00-21:15', label: '8:00-9:15 PM', periodo: 'noche' },
        { value: '21:15-22:30', label: '9:15-10:30 PM', periodo: 'noche' }
    ];

    let html = '<div class="calendar-grid">';

    fechas.forEach(fecha => {
        html += `<div class="date-section">`;
        html += `<h4 class="date-header">${formatFecha(fecha)}</h4>`;
        html += `<div class="time-slots">`;

        todosLosHorarios.forEach(horario => {
            const key = `${fecha}-${horario.value}`;
            const ocupadas = reservations[key] ? reservations[key].length : 0;
            const disponibles = MAX_MESAS_POR_TURNO - ocupadas;
            const porcentaje = (ocupadas / MAX_MESAS_POR_TURNO) * 100;

            let statusClass = 'available';
            let statusText = `${disponibles} disponibles`;

            if (disponibles === 0) {
                statusClass = 'full';
                statusText = 'Completo';
            } else if (disponibles <= 3) {
                statusClass = 'almost-full';
                statusText = `Solo ${disponibles}`;
            }

            html += `
                <div class="time-slot ${statusClass}" data-fecha="${fecha}" data-horario="${horario.value}">
                    <div class="time-slot-header">
                        <span class="time-label">${horario.label}</span>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="availability-bar">
                        <div class="availability-fill" style="width: ${porcentaje}%"></div>
                    </div>
                </div>
            `;
        });

        html += `</div></div>`;
    });

    html += '</div>';
    calendar.innerHTML = html;
}

// Actualizar indicador de disponibilidad en tiempo real
function updateAvailabilityIndicator() {
    const fecha = document.getElementById('fecha').value;
    const turno = document.getElementById('turno').value;
    const indicator = document.getElementById('availabilityIndicator');

    if (!fecha || !turno) {
        indicator.innerHTML = '';
        return;
    }

    const key = `${fecha}-${turno}`;
    const ocupadas = reservations[key] ? reservations[key].length : 0;
    const disponibles = MAX_MESAS_POR_TURNO - ocupadas;

    let statusHtml = '';

    if (disponibles === 0) {
        statusHtml = `<span class="status-error">❌ Sin mesas disponibles</span>`;
    } else if (disponibles <= 3) {
        statusHtml = `<span class="status-warning">⚠️ Solo quedan ${disponibles} mesas</span>`;
    } else {
        statusHtml = `<span class="status-success">✅ ${disponibles} mesas disponibles</span>`;
    }

    indicator.innerHTML = statusHtml;
}

// ===== SISTEMA DE SELECCIÓN MÚLTIPLE =====

// Agregar a selección
function addToSelection() {
    const fecha = document.getElementById('fecha').value;
    const turno = document.getElementById('turno').value;
    const nombre = document.getElementById('nombre').value.trim();
    const depto = document.getElementById('depto').value.trim();
    const telefono = document.getElementById('telefono').value.trim();
    const personas = parseInt(document.getElementById('personas').value);

    // Validar campos
    if (!fecha || !turno || !nombre || !depto || !telefono || !personas) {
        showNotification('Por favor complete todos los campos', 'error');
        return;
    }

    // Validar disponibilidad
    const key = `${fecha}-${turno}`;
    if (!reservations[key]) {
        reservations[key] = [];
    }

    if (reservations[key].length >= MAX_MESAS_POR_TURNO) {
        showNotification('No hay mesas disponibles para este horario', 'error');
        return;
    }

    // Verificar si ya existe en el carrito
    const exists = selectedReservations.some(item => item.fecha === fecha && item.turno === turno);
    if (exists) {
        showNotification('Esta reserva ya fue seleccionada', 'warning');
        return;
    }

    // Verificar si el departamento ya tiene reserva en este turno (en BD o en selección)
    const deptoExisteEnBD = reservations[key].some(r => r.depto.toLowerCase() === depto.toLowerCase());
    const deptoExisteEnSeleccion = selectedReservations.some(item =>
        item.fecha === fecha && item.turno === turno && item.depto.toLowerCase() === depto.toLowerCase()
    );

    if (deptoExisteEnBD || deptoExisteEnSeleccion) {
        showNotification('⚠️ Este departamento ya tiene una reserva en este turno y día', 'warning');
        return;
    }

    // Agregar al carrito
    selectedReservations.push({
        fecha,
        turno,
        nombre,
        depto,
        telefono,
        personas
    });

    updateSelectionDisplay();
    showNotification('✅ Agregado a tu selección', 'success');

    // Scroll al panel de selección
    const panel = document.getElementById('multipleReservationsPanel');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Limpiar solo fecha, turno y número de personas (mantener datos personales)
    document.getElementById('fecha').value = '';
    document.getElementById('turno').value = '';
    document.getElementById('availabilityIndicator').innerHTML = '';
}

// Actualizar visualización de selección
function updateSelectionDisplay() {
    const panel = document.getElementById('multipleReservationsPanel');
    const listContainer = document.getElementById('selectedReservations');
    const countBadge = document.getElementById('selectionCount');
    const confirmCount = document.getElementById('confirmCount');

    if (selectedReservations.length === 0) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    countBadge.textContent = selectedReservations.length;
    confirmCount.textContent = selectedReservations.length;

    // Calcular totales
    const totalPersonas = selectedReservations.reduce((sum, item) => sum + item.personas, 0);

    listContainer.innerHTML = `
        <div class="selection-summary">
            <p><strong>Total de reservas:</strong> ${selectedReservations.length}</p>
            <p><strong>Total de personas:</strong> ${totalPersonas}</p>
        </div>
        ${selectedReservations.map((item, index) => `
            <div class="cart-item">
                <div class="cart-item-info">
                    <strong>${formatFecha(item.fecha)}</strong> - ${item.turno}
                    <br>
                    <small>${item.personas} personas</small>
                </div>
                <button class="btn-remove-cart" onclick="removeFromSelection(${index})">❌</button>
            </div>
        `).join('')}
    `;
}

// Remover del carrito
function removeFromSelection(index) {
    selectedReservations.splice(index, 1);
    updateSelectionDisplay();
    showNotification('Removido de la selección', 'success');
}

// Limpiar selección
function clearSelection() {
    if (confirm('¿Desea limpiar todo el carrito?')) {
        selectedReservations = [];
        updateSelectionDisplay();
        showNotification('Selección limpiada', 'success');
    }
}

// Confirmar todas las reservas del carrito
function confirmMultipleReservations() {
    if (selectedReservations.length === 0) {
        showNotification('No hay reservas seleccionadas', 'warning');
        return;
    }

    let successCount = 0;
    let failedReservations = [];
    let codes = [];

    selectedReservations.forEach(item => {
        const key = `${item.fecha}-${item.turno}`;

        if (!reservations[key]) {
            reservations[key] = [];
        }

        // Re-validar disponibilidad en tiempo real
        const currentAvailability = MAX_MESAS_POR_TURNO - reservations[key].length;

        // Re-validar que el departamento no haya reservado mientras tanto
        const deptoYaReservo = reservations[key].some(r => r.depto.toLowerCase() === item.depto.toLowerCase());

        if (currentAvailability <= 0) {
            failedReservations.push({
                ...item,
                reason: 'Sin disponibilidad'
            });
        } else if (deptoYaReservo) {
            failedReservations.push({
                ...item,
                reason: 'Departamento ya tiene reserva'
            });
        } else {
            // Proceder con la reserva
            const reservation = {
                id: Date.now() + successCount,
                fecha: item.fecha,
                turno: item.turno,
                nombre: item.nombre,
                depto: item.depto,
                telefono: item.telefono,
                personas: item.personas,
                fechaReserva: new Date().toLocaleString('es-ES')
            };

            const confirmationCode = `AV${reservation.id.toString().slice(-6)}`;
            reservation.codigo = confirmationCode;

            reservations[key].push(reservation);
            successCount++;
            codes.push({
                fecha: item.fecha,
                turno: item.turno,
                codigo: confirmationCode
            });
        }
    });

    saveReservations();
    updateAvailability();
    displayReservations();
    generateAvailabilityCalendar(); // Auto-actualizar calendario

    // Guardar perfil
    if (selectedReservations.length > 0) {
        saveUserProfile({
            nombre: selectedReservations[0].nombre,
            telefono: selectedReservations[0].telefono,
            depto: selectedReservations[0].depto
        });
    }

    // Mostrar confirmación múltiple
    showMultipleConfirmation(codes);

    // Limpiar selección
    selectedReservations = [];
    updateSelectionDisplay();

    // Notificación con resumen
    if (failedReservations.length > 0) {
        showNotification(`✅ ${successCount} confirmadas | ⚠️ ${failedReservations.length} fallidas`, 'warning');
        console.warn('Reservas fallidas:', failedReservations);
    } else {
        showNotification(`¡${successCount} reservas confirmadas! 🎉`, 'success');
    }
}

// Mostrar confirmación múltiple
function showMultipleConfirmation(codes) {
    const box = document.getElementById('confirmationBox');
    const details = document.getElementById('confirmationDetails');
    const codeElement = document.getElementById('confirmationCode');

    // Crear string con todos los códigos para copiar
    const allCodes = codes.map(c => `${formatFecha(c.fecha)} ${c.turno}: ${c.codigo}`).join('\n');

    details.innerHTML = `
        <h4>Resumen de Reservas:</h4>
        ${codes.map(c => `
            <p><strong>${formatFecha(c.fecha)}</strong> - ${c.turno}</p>
            <p style="margin-left: 20px;">Código: <strong>${c.codigo}</strong></p>
        `).join('')}
        <button class="btn-copy-codes" onclick="copyToClipboard(\`${allCodes}\`)">
            📋 Copiar Todos los Códigos
        </button>
    `;
    codeElement.textContent = 'Ver arriba';

    box.style.display = 'block';
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Copiar códigos al portapapeles
function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('📋 Códigos copiados al portapapeles', 'success');
        }).catch(() => {
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }
}

// Fallback para navegadores antiguos
function fallbackCopy(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
        document.execCommand('copy');
        showNotification('📋 Códigos copiados al portapapeles', 'success');
    } catch (err) {
        showNotification('No se pudo copiar. Por favor, cópielos manualmente.', 'warning');
    }
    document.body.removeChild(textArea);
}

// ===== FUNCIONES DE PERFIL =====

// Cargar perfil de usuario
function loadUserProfile() {
    if (userProfile) {
        document.getElementById('savedProfile').style.display = 'block';
        document.getElementById('profileName').textContent = userProfile.nombre;
    }
}

// Guardar perfil de usuario
function saveUserProfile(profile) {
    userProfile = profile;
    localStorage.setItem('userProfile', JSON.stringify(profile));
    loadUserProfile();
}

// Usar datos guardados
function loadProfile() {
    if (userProfile) {
        document.getElementById('nombre').value = userProfile.nombre;
        document.getElementById('depto').value = userProfile.depto;
        document.getElementById('telefono').value = userProfile.telefono;
        showNotification('Datos cargados', 'success');
    }
}

// ===== BÚSQUEDA DE MIS RESERVAS =====

function searchMyReservations() {
    const query = document.getElementById('myReservationsSearch').value.trim().toLowerCase();
    const container = document.getElementById('myReservationsList');

    if (!query) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Ingrese su teléfono o código de confirmación para buscar sus reservas</p>';
        return;
    }

    // Buscar en todas las reservas
    const myReservations = [];
    Object.keys(reservations).forEach(key => {
        reservations[key].forEach(r => {
            if (
                (r.telefono && r.telefono.includes(query)) ||
                (r.codigo && r.codigo.toLowerCase().includes(query)) ||
                (r.nombre && r.nombre.toLowerCase().includes(query))
            ) {
                myReservations.push({
                    ...r,
                    key,
                    turnoNombre: r.turno,
                    fechaNombre: formatFecha(r.fecha)
                });
            }
        });
    });

    if (myReservations.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No se encontraron reservas</p>';
        return;
    }

    // Ordenar por fecha
    myReservations.sort((a, b) => a.fecha.localeCompare(b.fecha));

    container.innerHTML = myReservations.map(r => `
        <div class="reservation-item">
            <div class="reservation-info">
                <strong>${r.nombre || 'Sin nombre'}</strong> -
                <strong>${r.fechaNombre}</strong> -
                <strong>${r.turno}</strong><br>
                Depto: <strong>${r.depto}</strong> -
                Personas: <strong>${r.personas}</strong>
                ${r.telefono ? `<br>Tel: <strong>${r.telefono}</strong>` : ''}
                ${r.codigo ? `<br>Código: <strong>${r.codigo}</strong>` : ''}
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
// Toggle calendario en móvil
function toggleCalendar() {
    const calendar = document.getElementById('availabilityCalendar');
    const button = document.getElementById('btnToggleCalendar');
    const text = document.getElementById('calendarToggleText');
    
    if (calendar.style.display === 'none') {
        calendar.style.display = 'block';
        text.textContent = 'Ocultar';
        button.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        calendar.style.display = 'none';
        text.textContent = 'Ver Todo';
    }
}

// Auto-colapsar calendario en móviles al cargar
if (window.innerWidth <= 768) {
    window.addEventListener('load', () => {
        const calendar = document.getElementById('availabilityCalendar');
        if (calendar) {
            calendar.style.display = 'none';
        }
    });
}
