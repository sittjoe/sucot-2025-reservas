// Configuración
const MAX_MESAS_POR_TURNO = 10;
const MAX_PERSONAS_POR_MESA = 8;
const ADMIN_PASSWORD = 'avivia2025'; // Cambiar esta contraseña

// Estado de la aplicación
let reservations = {}; // Ahora se sincroniza con Firebase
let reservationsCache = {}; // Cache para optimización
let lastUpdateTimestamp = 0;

let isAdminLoggedIn = false;
let isOnline = true;
let isFirebaseConnected = false;

// Sistema de selección múltiple (reemplaza "carrito")
let selectedReservations = [];

// Perfil de usuario (sigue usando localStorage - es local del usuario)
let userProfile = JSON.parse(localStorage.getItem('userProfile')) || null;

// Debounce helper function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle helper function
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Detectar estado de conexión
window.addEventListener('online', () => {
    isOnline = true;
    updateConnectionStatus();
    showNotification('✅ Conexión restaurada', 'success');
});

window.addEventListener('offline', () => {
    isOnline = false;
    updateConnectionStatus();
    showNotification('⚠️ Sin conexión a internet', 'warning');
});

// Monitor de conexión Firebase
const connectedRef = firebase.database().ref('.info/connected');
connectedRef.on('value', (snap) => {
    isFirebaseConnected = snap.val() === true;
    updateConnectionStatus();
});

function updateConnectionStatus() {
    const indicator = document.getElementById('connectionIndicator');
    if (!indicator) {
        // Crear indicador si no existe
        const div = document.createElement('div');
        div.id = 'connectionIndicator';
        div.className = 'connection-indicator';
        document.body.appendChild(div);
    }

    const indicatorEl = document.getElementById('connectionIndicator');
    if (isFirebaseConnected && isOnline) {
        indicatorEl.className = 'connection-indicator online';
        indicatorEl.innerHTML = '🟢 Conectado';
    } else {
        indicatorEl.className = 'connection-indicator offline';
        indicatorEl.innerHTML = '🔴 Sin conexión';
    }
}

// Listener de Firebase optimizado con throttling
const throttledUpdate = throttle(() => {
    updateAvailability();
    displayReservations();
    generateAvailabilityCalendar();
    if (isAdminLoggedIn) {
        updateAdminStats();
        displayAdminReservations();
    }
}, 500); // Máximo una actualización cada 500ms

reservationsRef.on('value', (snapshot) => {
    const newData = snapshot.val() || {};
    const dataChanged = JSON.stringify(newData) !== JSON.stringify(reservations);

    if (dataChanged) {
        reservations = newData;
        reservationsCache = { ...newData };
        lastUpdateTimestamp = Date.now();
        throttledUpdate();
    }
});

// Horarios disponibles
const HORARIOS = {
    'mediodia': ['12:00-14:00', '14:00-16:00'],
    'noche': ['19:30-21:30', '21:30-00:00']
};

// Waitlist
let waitlist = {}; // waitlist[key] = [{nombre, depto, telefono, personas, fechaRegistro}]

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

    // Validar número de personas
    if (personas > MAX_PERSONAS_POR_MESA) {
        showNotification(`El máximo es ${MAX_PERSONAS_POR_MESA} personas por mesa`, 'error');
        return;
    }

    // Validar disponibilidad - si está lleno, ofrecer waitlist
    if (reservations[key].length >= MAX_MESAS_POR_TURNO) {
        if (confirm('Este turno está completo. ¿Desea agregarse a la lista de espera?')) {
            addToWaitlist(fecha, turno, nombre, depto, telefono, personas);
        }
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

    const qrCodeHtml = showQRCodeInConfirmation(code);

    details.innerHTML = `
        <p><strong>Nombre:</strong> ${reservation.nombre}</p>
        <p><strong>Fecha:</strong> ${formatFecha(reservation.fecha)}</p>
        <p><strong>Turno:</strong> ${getTurnoEmoji(reservation.turno)} ${getTurnoNombre(reservation.turno)}</p>
        <p><strong>Departamento:</strong> ${reservation.depto}</p>
        <p><strong>Personas:</strong> ${reservation.personas}</p>
        <p><strong>Teléfono:</strong> ${reservation.telefono}</p>
        ${qrCodeHtml}
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

// Guardar en Firebase (reemplaza localStorage)
function saveReservations() {
    if (!isFirebaseConnected) {
        showNotification('⚠️ Sin conexión. Los cambios se guardarán cuando se restablezca la conexión.', 'warning');
        return Promise.reject(new Error('No Firebase connection'));
    }

    return reservationsRef.set(reservations).catch((error) => {
        handleError(error, 'saveReservations');
    });
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
            } else if (r.turno.startsWith('19:30') || r.turno.startsWith('21:30')) {
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

// Filtrar reservas (con debouncing)
const filterReservations = debounce(function() {
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
}, 300);

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
        { value: '19:30-21:30', label: '7:30-9:30 PM', periodo: 'noche' },
        { value: '21:30-00:00', label: '9:30-12:00 AM', periodo: 'noche' }
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

const searchMyReservations = debounce(function() {
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
}, 300);

// Toggle calendario en móvil
function toggleCalendar() {
    const calendar = document.getElementById('availabilityCalendar');
    const button = document.getElementById('btnToggleCalendar');
    const text = document.getElementById('calendarToggleText');

    if (calendar.style.display === 'none') {
        calendar.style.display = 'block';
        text.textContent = '👆 Haz clic aquí para ocultar los horarios';
        button.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        calendar.style.display = 'none';
        text.textContent = '👉 Haz clic aquí para ver todos los horarios disponibles';
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

// ===== FUNCIONES DE WAITLIST =====

// Agregar a lista de espera
function addToWaitlist(fecha, turno, nombre, depto, telefono, personas) {
    const key = `${fecha}-${turno}`;

    if (!waitlist[key]) {
        waitlist[key] = [];
    }

    // Verificar si el departamento ya está en waitlist
    const yaEnWaitlist = waitlist[key].some(w => w.depto.toLowerCase() === depto.toLowerCase());
    if (yaEnWaitlist) {
        showNotification('Ya estás en la lista de espera para este turno', 'warning');
        return;
    }

    const waitlistEntry = {
        id: Date.now(),
        fecha,
        turno,
        nombre,
        depto,
        telefono,
        personas,
        fechaRegistro: new Date().toLocaleString('es-ES')
    };

    waitlist[key].push(waitlistEntry);
    saveWaitlist();

    showNotification(`✅ Agregado a lista de espera. Posición: ${waitlist[key].length}`, 'success');

    // Limpiar formulario
    document.getElementById('fecha').value = '';
    document.getElementById('turno').value = '';
    document.getElementById('personas').value = '';
}

// Guardar waitlist en Firebase
function saveWaitlist() {
    const waitlistRef = firebase.database().ref('waitlist');
    waitlistRef.set(waitlist).catch((error) => {
        console.error('Error al guardar waitlist:', error);
    });
}

// Cargar waitlist desde Firebase
firebase.database().ref('waitlist').on('value', (snapshot) => {
    waitlist = snapshot.val() || {};
});

// ===== MICRO-INTERACCIONES Y VALIDACIÓN =====

// Agregar ripple effect a todos los botones
document.addEventListener('DOMContentLoaded', () => {
    const buttons = document.querySelectorAll('button, .btn-submit, .btn-add-selection, .btn-confirm-multiple');
    buttons.forEach(btn => {
        if (!btn.classList.contains('ripple')) {
            btn.classList.add('ripple');
        }
    });
});

// Validación visual en tiempo real
function setupFormValidation() {
    const nombre = document.getElementById('nombre');
    const depto = document.getElementById('depto');
    const telefono = document.getElementById('telefono');
    const personas = document.getElementById('personas');
    const fecha = document.getElementById('fecha');
    const turno = document.getElementById('turno');

    if (nombre) {
        nombre.addEventListener('input', (e) => {
            if (e.target.value.length >= 3) {
                e.target.classList.add('valid');
                e.target.classList.remove('invalid');
            } else {
                e.target.classList.remove('valid');
                if (e.target.value.length > 0) {
                    e.target.classList.add('invalid');
                }
            }
        });
    }

    if (telefono) {
        telefono.addEventListener('input', (e) => {
            const phonePattern = /[0-9\-\+\(\)\s]+/;
            if (phonePattern.test(e.target.value) && e.target.value.length >= 7) {
                e.target.classList.add('valid');
                e.target.classList.remove('invalid');
            } else {
                e.target.classList.remove('valid');
                if (e.target.value.length > 0) {
                    e.target.classList.add('invalid');
                }
            }
        });
    }

    if (depto) {
        depto.addEventListener('input', (e) => {
            if (e.target.value.length >= 1) {
                e.target.classList.add('valid');
                e.target.classList.remove('invalid');
            } else {
                e.target.classList.remove('valid');
            }
        });
    }

    if (personas) {
        personas.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if (val >= 1 && val <= 8) {
                e.target.classList.add('valid');
                e.target.classList.remove('invalid');
            } else {
                e.target.classList.remove('valid');
                if (e.target.value.length > 0) {
                    e.target.classList.add('invalid');
                }
            }
        });
    }

    if (fecha) {
        fecha.addEventListener('change', (e) => {
            if (e.target.value) {
                e.target.classList.add('valid');
                e.target.classList.remove('invalid');
            } else {
                e.target.classList.remove('valid');
            }
        });
    }

    if (turno) {
        turno.addEventListener('change', (e) => {
            if (e.target.value) {
                e.target.classList.add('valid');
                e.target.classList.remove('invalid');
            } else {
                e.target.classList.remove('valid');
            }
        });
    }
}

// Ejecutar validación al cargar
document.addEventListener('DOMContentLoaded', setupFormValidation);

// ===== MODO OSCURO =====

// Cargar preferencia de modo oscuro
let darkMode = localStorage.getItem('darkMode') === 'true';

function toggleDarkMode() {
    darkMode = !darkMode;
    localStorage.setItem('darkMode', darkMode);
    applyDarkMode();
    showNotification(darkMode ? '🌙 Modo oscuro activado' : '☀️ Modo claro activado', 'success');
}

function applyDarkMode() {
    if (darkMode) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
}

// Aplicar modo oscuro al cargar
document.addEventListener('DOMContentLoaded', () => {
    applyDarkMode();

    // Crear botón de modo oscuro si no existe
    if (!document.getElementById('darkModeToggle')) {
        const header = document.querySelector('header');
        if (header) {
            const darkModeBtn = document.createElement('button');
            darkModeBtn.id = 'darkModeToggle';
            darkModeBtn.className = 'btn-dark-mode';
            darkModeBtn.innerHTML = darkMode ? '☀️' : '🌙';
            darkModeBtn.onclick = () => {
                toggleDarkMode();
                darkModeBtn.innerHTML = darkMode ? '☀️' : '🌙';
            };
            darkModeBtn.title = 'Alternar modo oscuro/claro';
            header.appendChild(darkModeBtn);
        }
    }
});

// Confetti effect
function createConfetti() {
    const colors = ['#D4AF37', '#E07A5F', '#556B2F', '#F4A261', '#2ECC71'];
    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDelay = Math.random() * 0.5 + 's';
            confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
            document.body.appendChild(confetti);

            setTimeout(() => confetti.remove(), 3000);
        }, i * 30);
    }
}

// Auto-guardar datos del formulario en localStorage
function autoSaveFormData() {
    const formFields = ['nombre', 'depto', 'telefono'];

    formFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            // Cargar valor guardado
            const savedValue = localStorage.getItem(`form_${fieldId}`);
            if (savedValue && !field.value) {
                field.value = savedValue;
            }

            // Guardar en cada cambio
            field.addEventListener('input', (e) => {
                localStorage.setItem(`form_${fieldId}`, e.target.value);
            });
        }
    });
}

document.addEventListener('DOMContentLoaded', autoSaveFormData);

// Mejorar función de confirmación con confetti
const originalShowConfirmationBox = showConfirmationBox;
showConfirmationBox = function(reservation, code, key) {
    originalShowConfirmationBox(reservation, code, key);
    createConfetti();

    // Agregar bounce al box
    const box = document.getElementById('confirmationBox');
    if (box) {
        box.classList.add('bounce');
        setTimeout(() => box.classList.remove('bounce'), 1000);
    }
};

// Loading state en botones
function addButtonLoading(button) {
    button.classList.add('btn-loading');
    button.disabled = true;
    button.dataset.originalText = button.innerHTML;
    button.innerHTML = '<span class="spinner"></span> Procesando...';
}

function removeButtonLoading(button) {
    button.classList.remove('btn-loading');
    button.disabled = false;
    if (button.dataset.originalText) {
        button.innerHTML = button.dataset.originalText;
    }
}

// ===== CÓDIGOS QR PARA CONFIRMACIONES =====

function generateQRCode(text) {
    // Usar una API pública para generar QR codes
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}`;
    return qrUrl;
}

function showQRCodeInConfirmation(code) {
    const qrImage = generateQRCode(code);
    return `<div class="qr-code-container">
        <img src="${qrImage}" alt="Código QR" class="qr-code-image" loading="lazy">
        <p class="qr-code-label">Escanea este código para guardar tu confirmación</p>
    </div>`;
}

// ===== ESTADÍSTICAS VISUALES MEJORADAS =====

function renderStatChart(label, current, max, color) {
    const percentage = (current / max) * 100;
    return `
        <div class="stat-chart">
            <div class="stat-label">${label}</div>
            <div class="stat-bar-container">
                <div class="stat-bar-fill" style="width: ${percentage}%; background: ${color}"></div>
            </div>
            <div class="stat-value">${current} / ${max}</div>
        </div>
    `;
}

// ===== LOADING SKELETONS =====

function showLoadingSkeleton(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="skeleton-container">
            <div class="skeleton skeleton-header"></div>
            <div class="skeleton skeleton-text"></div>
            <div class="skeleton skeleton-text"></div>
            <div class="skeleton skeleton-button"></div>
        </div>
    `.repeat(3);
}

// ===== MANEJO DE ERRORES MEJORADO =====

function handleError(error, context = '') {
    console.error(`Error en ${context}:`, error);

    let message = 'Ha ocurrido un error. Por favor, intente nuevamente.';

    if (!isOnline) {
        message = '⚠️ Sin conexión a internet. Revise su conexión.';
    } else if (!isFirebaseConnected) {
        message = '⚠️ No se puede conectar a la base de datos. Intente más tarde.';
    } else if (error.code === 'PERMISSION_DENIED') {
        message = '🔒 Permisos insuficientes. Contacte al administrador.';
    } else if (error.message) {
        message = error.message;
    }

    showNotification(message, 'error');

    // Log para debugging
    if (window.console && console.error) {
        console.error('Error details:', {
            context,
            error,
            isOnline,
            isFirebaseConnected,
            timestamp: new Date().toISOString()
        });
    }
}

// Envolver operaciones de Firebase con manejo de errores
function safeSaveReservations() {
    return reservationsRef.set(reservations)
        .catch((error) => {
            handleError(error, 'guardar reservas');
            throw error; // Re-throw para que el caller pueda manejarlo
        });
}

// ===== OPTIMIZACIÓN DE RENDERIZADO =====

// Cache de elementos del DOM
const domCache = {
    availabilityCalendar: null,
    myReservationsList: null,
    adminReservationsList: null
};

function getCachedElement(id) {
    if (!domCache[id]) {
        domCache[id] = document.getElementById(id);
    }
    return domCache[id];
}

// Limpiar cache cuando sea necesario
function clearDomCache() {
    Object.keys(domCache).forEach(key => {
        domCache[key] = null;
    });
}
