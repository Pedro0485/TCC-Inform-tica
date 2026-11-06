document.addEventListener('DOMContentLoaded', function () {

    const calendarEl = document.getElementById('calendar');

    if (!calendarEl) return;

    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    // Apenas a coordenadora (professor com admin) cria/edita/exclui eventos.
    function ehCoordenador() {
        try {
            const payload = JSON.parse(
                atob((localStorage.getItem('token') || '').split('.')[1]
                    .replace(/-/g, '+').replace(/_/g, '/'))
            );
            return payload.tipo === 'professor' && Boolean(payload.admin);
        } catch (e) {
            return false;
        }
    }

    const podeEditar = ehCoordenador();

    // Cores usadas para diferenciar os tipos de evento.
    const eventColors = {
        prova: '#e11233',
        reuniao: '#7c3aed',
        entrega: '#f59e0b',
        aula: '#2563eb',
        evento: '#16a34a'
    };

    function detectarCor(titulo) {
        const texto = titulo.toLowerCase();

        if (texto.includes('prova') || texto.includes('teste')) {
            return eventColors.prova;
        }

        if (texto.includes('reuni')) {
            return eventColors.reuniao;
        }

        if (texto.includes('entrega') || texto.includes('trabalho')) {
            return eventColors.entrega;
        }

        if (texto.includes('aula')) {
            return eventColors.aula;
        }

        return eventColors.evento;
    }

    // ------------------------------------------------------------
    // API
    // ------------------------------------------------------------

    async function api(url, options = {}) {

        const token = localStorage.getItem('token') || '';

        const headers = { 'Content-Type': 'application/json' };

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(url, {
            ...options,
            headers,
            cache: 'no-store'
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(
                data?.error || data?.message || `Erro HTTP ${response.status}`
            );
        }

        return data;
    }

    function erroAlerta(err) {
        Swal.fire({
            icon: 'error',
            title: 'Erro',
            text: err.message || 'Não foi possível concluir a operação.'
        });
    }

    function paraEventoCalendario(ev) {

        const cor = detectarCor(ev.titulo);

        return {
            id: String(ev.id),
            title: ev.titulo,
            start: ev.hora ? `${String(ev.data).slice(0, 10)}T${ev.hora}` : String(ev.data).slice(0, 10),
            // Eventos com hora entram na grade semanal; eventos sem hora aparecem na faixa de dia inteiro.
            allDay: !ev.hora,
            backgroundColor: cor,
            borderColor: cor,
            editable: podeEditar && Boolean(ev.editavel),
            extendedProps: {
                descricao: ev.descricao || '',
                editavel: Boolean(ev.editavel),
                notificacaoId: ev.notificacao_id || null,
                horaEvento: ev.hora || null
            }
        };
    }

    async function carregarEventos() {

        if (!localStorage.getItem('token')) return;

        try {

            const lista = await api('/eventos');

            calendar.removeAllEvents();

            (Array.isArray(lista) ? lista : []).forEach(ev => {
                calendar.addEvent(paraEventoCalendario(ev));
            });

        } catch (err) {
            console.error('[calendário] Erro ao carregar eventos:', err);
        }
    }

    // ------------------------------------------------------------
    // UTILITÁRIOS
    // ------------------------------------------------------------

    function dois(n) {
        return String(n).padStart(2, '0');
    }

    function dataISO(data) {
        return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`;
    }

    function horaISO(data) {
        return `${dois(data.getHours())}:${dois(data.getMinutes())}`;
    }

    function formatarData(data) {
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).format(data);
    }

    function escapeHtml(text) {

        const div = document.createElement('div');

        div.textContent = text == null ? '' : String(text);

        return div.innerHTML;
    }

    // ------------------------------------------------------------
    // FORMULÁRIO (novo / edição)
    // ------------------------------------------------------------

    function abrirFormulario({ titulo, confirmar, valores }) {

        return Swal.fire({
            title: titulo,
            html: `
                <input id="tituloEvento" class="swal2-input" maxlength="150"
                    placeholder="Título do evento"
                    value="${escapeHtml(valores.titulo)}">

                <textarea id="descricaoEvento" class="swal2-textarea"
                    placeholder="Descrição (opcional)">${escapeHtml(valores.descricao)}</textarea>

                <input id="dataEvento" type="date" class="swal2-input"
                    value="${escapeHtml(valores.data)}">

                <input id="horaEvento" type="time" class="swal2-input"
                    value="${escapeHtml(valores.hora)}">
            `,
            showCancelButton: true,
            confirmButtonText: confirmar,
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#e11233',
            cancelButtonColor: '#6c757d',
            customClass: {
                popup: 'meu-alerta'
            },
            preConfirm: () => {

                const titulo = document.getElementById('tituloEvento').value.trim();
                const descricao = document.getElementById('descricaoEvento').value.trim();
                const data = document.getElementById('dataEvento').value;
                const hora = document.getElementById('horaEvento').value;

                if (!titulo) {
                    Swal.showValidationMessage('Digite um título para o evento');
                    return false;
                }

                if (!data) {
                    Swal.showValidationMessage('Selecione a data do evento');
                    return false;
                }

                return { titulo, descricao, data, hora };
            }
        });
    }

    function abrirNovoEvento(info) {

        abrirFormulario({
            titulo: 'Novo evento',
            confirmar: 'Criar evento',
            valores: {
                titulo: '',
                descricao: '',
                data: info.dateStr.slice(0, 10),
                hora: info.dateStr.length > 10 ? info.dateStr.slice(11, 16) : ''
            }
        }).then(async (result) => {

            if (!result.isConfirmed) return;

            try {

                const criado = await api('/eventos', {
                    method: 'POST',
                    body: JSON.stringify(result.value)
                });

                calendar.addEvent(paraEventoCalendario(criado));

            } catch (err) {
                return erroAlerta(err);
            }

            if (window.NoctopusNotifications) {
                window.NoctopusNotifications.add({
                    title: 'Novo evento no calendário',
                    message: `${result.value.titulo} — ${result.value.data.split('-').reverse().join('/')}`,
                    type: 'calendar',
                    url: location.href
                });
            }

            Swal.fire({
                icon: 'success',
                title: 'Evento criado!',
                text: 'O evento foi adicionado ao calendário.',
                timer: 1500,
                showConfirmButton: false
            });
        });
    }

    function abrirDetalhesEvento(info) {

        const evento = info.event;
        const editavel = podeEditar && Boolean(evento.extendedProps.editavel);

        const descricao = evento.extendedProps.descricao
            ? escapeHtml(evento.extendedProps.descricao).replace(/\n/g, '<br>')
            : 'Nenhuma descrição cadastrada.';

        const data = evento.start ? formatarData(evento.start) : 'Data não informada';

        const horario = evento.allDay
            ? 'Dia inteiro'
            : horaISO(evento.start);

        Swal.fire({
            title: escapeHtml(evento.title),
            html: `
                <div style="text-align:left; line-height:1.6;">
                    <p style="margin-bottom:8px;">
                        <strong>Data:</strong> ${data}
                    </p>

                    <p style="margin-bottom:8px;">
                        <strong>Horário:</strong> ${horario}
                    </p>

                    <p style="margin:0;">
                        <strong>Descrição:</strong><br>
                        ${descricao}
                    </p>
                </div>
            `,
            showDenyButton: editavel,
            showConfirmButton: editavel,
            showCancelButton: true,
            confirmButtonText: 'Editar',
            denyButtonText: 'Excluir',
            cancelButtonText: 'Fechar',
            confirmButtonColor: '#e11233',
            denyButtonColor: '#dc3545',
            cancelButtonColor: '#6c757d',
            customClass: {
                popup: 'meu-alerta'
            }
        }).then((result) => {

            if (result.isConfirmed) {
                editarEvento(evento);

            } else if (result.isDenied) {
                excluirEvento(evento);
            }
        });
    }

    function editarEvento(evento) {

        abrirFormulario({
            titulo: 'Editar evento',
            confirmar: 'Salvar alterações',
            valores: {
                titulo: evento.title,
                descricao: evento.extendedProps.descricao || '',
                data: evento.start ? dataISO(evento.start) : '',
                hora: evento.start && !evento.allDay ? horaISO(evento.start) : ''
            }
        }).then(async (result) => {

            if (!result.isConfirmed) return;

            try {

                const atualizado = await api(`/eventos/${evento.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(result.value)
                });

                const novo = paraEventoCalendario(atualizado);

                evento.setProp('title', novo.title);
                evento.setProp('backgroundColor', novo.backgroundColor);
                evento.setProp('borderColor', novo.borderColor);
                evento.setExtendedProp('descricao', novo.extendedProps.descricao);
                evento.setAllDay(novo.allDay);
                evento.setStart(novo.start);

            } catch (err) {
                return erroAlerta(err);
            }

            Swal.fire({
                icon: 'success',
                title: 'Evento atualizado!',
                timer: 1300,
                showConfirmButton: false
            });
        });
    }

    function excluirEvento(evento) {

        Swal.fire({
            title: 'Excluir evento?',

            text: `O evento "${evento.title}" será removido do calendário.`,

            icon: 'warning',

            showCancelButton: true,

            confirmButtonText: 'Sim, excluir',
            cancelButtonText: 'Cancelar',

            confirmButtonColor: '#dc3545',
            cancelButtonColor: '#6c757d',

            customClass: {
                popup: 'meu-alerta'
            }

        }).then(async (result) => {

            if (!result.isConfirmed) return;

            try {

                await api(`/eventos/${evento.id}`, { method: 'DELETE' });

                evento.remove();

            } catch (err) {
                return erroAlerta(err);
            }

            Swal.fire({
                icon: 'success',
                title: 'Evento excluído!',
                timer: 1300,
                showConfirmButton: false
            });
        });
    }

    // Arrastar um evento para outro dia/horário
    async function moverEvento(info) {

        const evento = info.event;

        try {

            await api(`/eventos/${evento.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    titulo: evento.title,
                    descricao: evento.extendedProps.descricao || '',
                    data: dataISO(evento.start),
                    hora: evento.allDay ? '' : horaISO(evento.start)
                })
            });

        } catch (err) {
            info.revert();
            erroAlerta(err);
        }
    }

    const calendar = new FullCalendar.Calendar(calendarEl, {

        locale: 'pt-br',

        initialView: 'dayGridMonth',

        height: 'auto',

        allDaySlot: true,
        slotMinTime: '07:00:00',
        slotMaxTime: '23:00:00',
        scrollTime: '07:00:00',
        slotDuration: '01:00:00',

        contentHeight: 'auto',

        aspectRatio: isMobile
            ? 0.9
            : 1.35,

        nowIndicator: true,

        dayMaxEvents: 3,

        editable: podeEditar,

        selectable: false,

        eventDisplay: 'block',

        // A hora continua visível no título sem transformar o evento em uma barra de vários dias.
        eventContent(info) {
            const hora = info.event.extendedProps.horaEvento;
            const titulo = info.event.title || '';
            const texto = hora ? hora + ' ' + titulo : titulo;
            const span = document.createElement('span');
            span.textContent = texto;
            return { domNodes: [span] };
        },

        headerToolbar: isMobile
            ? {
                left: 'today',
                center: 'prev,title,next',
                right: ''
            }
            : {
                left: 'today',
                center: 'prev,title,next',
                right: 'dayGridMonth,timeGridWeek'
            },

        footerToolbar: isMobile
            ? {
                left: '',
                center: 'dayGridMonth,timeGridWeek',
                right: ''
            }
            : false,

        buttonText: {
            today: 'Hoje',
            month: 'Mês',
            week: 'Semana'
        },

        noEventsContent: 'Nenhum evento neste período',

        events: [],

        eventDrop: moverEvento,

        dateClick: function (info) {

            if (!podeEditar) return;

            abrirNovoEvento(info);

        },

        eventClick: function (info) {

            info.jsEvent.preventDefault();

            abrirDetalhesEvento(info);

        }
    });

    calendar.render();

    carregarEventos();

});


