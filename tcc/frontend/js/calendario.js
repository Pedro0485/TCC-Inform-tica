document.addEventListener('DOMContentLoaded', function () {

    const calendarEl = document.getElementById('calendar');

    if (!calendarEl) return;

    const isMobile = window.matchMedia('(max-width: 768px)').matches;

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

    function formatarData(data) {
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).format(data);
    }

    function abrirNovoEvento(info) {
        Swal.fire({
            title: 'Novo evento',
            html: `
                <input id="tituloEvento" class="swal2-input" placeholder="Nome do evento">
                <input id="descricaoEvento" class="swal2-input" placeholder="Descrição (opcional)">
            `,
            showCancelButton: true,
            confirmButtonText: 'Criar evento',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#e11233',
            cancelButtonColor: '#6c757d',
            customClass: {
                popup: 'meu-alerta'
            },
            preConfirm: () => {
                const titulo = document.getElementById('tituloEvento').value.trim();
                const descricao = document.getElementById('descricaoEvento').value.trim();

                if (!titulo) {
                    Swal.showValidationMessage('Digite um título para o evento');
                    return false;
                }

                return { titulo, descricao };
            }
        }).then((result) => {
            if (!result.isConfirmed) return;

            const cor = detectarCor(result.value.titulo);

            calendar.addEvent({
                title: result.value.titulo,
                start: info.dateStr,
                backgroundColor: cor,
                borderColor: cor,
                extendedProps: {
                    descricao: result.value.descricao
                }
            });

            if (window.NoctopusNotifications) {
                window.NoctopusNotifications.add({
                    title: 'Novo evento no calendário',
                    message: `${result.value.titulo} — ${info.dateStr.split('-').reverse().join('/')}`,
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
        const descricao = evento.extendedProps.descricao || 'Nenhuma descrição cadastrada.';
        const data = evento.start ? formatarData(evento.start) : 'Data não informada';

        Swal.fire({
            title: evento.title,
            html: `
                <div style="text-align:left; line-height:1.6;">
                    <p style="margin-bottom:8px;">
                        <strong>📅 Data:</strong> ${data}
                    </p>

                    <p style="margin:0;">
                        <strong>📝 Descrição:</strong><br>
                        ${descricao}
                    </p>
                </div>
            `,
            showDenyButton: true,
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

        Swal.fire({
            title: 'Editar evento',

            html: `
                <input 
                    id="tituloEvento" 
                    class="swal2-input" 
                    value="${escapeHtml(evento.title)}"
                    placeholder="Nome do evento"
                >

                <input 
                    id="descricaoEvento" 
                    class="swal2-input" 
                    value="${escapeHtml(evento.extendedProps.descricao || '')}"
                    placeholder="Descrição"
                >
            `,

            showCancelButton: true,
            confirmButtonText: 'Salvar alterações',
            cancelButtonText: 'Cancelar',

            confirmButtonColor: '#e11233',
            cancelButtonColor: '#6c757d',

            customClass: {
                popup: 'meu-alerta'
            },

            preConfirm: () => {

                const titulo = document
                    .getElementById('tituloEvento')
                    .value
                    .trim();

                const descricao = document
                    .getElementById('descricaoEvento')
                    .value
                    .trim();

                if (!titulo) {
                    Swal.showValidationMessage(
                        'Digite um título para o evento'
                    );

                    return false;
                }

                return {
                    titulo,
                    descricao
                };
            }

        }).then((result) => {

            if (!result.isConfirmed) return;

            const cor = detectarCor(result.value.titulo);

            evento.setProp(
                'title',
                result.value.titulo
            );

            evento.setProp(
                'backgroundColor',
                cor
            );

            evento.setProp(
                'borderColor',
                cor
            );

            evento.setExtendedProp(
                'descricao',
                result.value.descricao
            );

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

        }).then((result) => {

            if (!result.isConfirmed) return;

            evento.remove();

            Swal.fire({
                icon: 'success',
                title: 'Evento excluído!',
                timer: 1300,
                showConfirmButton: false
            });
        });
    }

    function escapeHtml(text) {

        const div = document.createElement('div');

        div.textContent = text;

        return div.innerHTML;
    }

    const calendar = new FullCalendar.Calendar(calendarEl, {

        locale: 'pt-br',

        initialView: isMobile
            ? 'listWeek'
            : 'dayGridMonth',

        height: 'auto',

        contentHeight: 'auto',

        aspectRatio: isMobile
            ? 0.9
            : 1.35,

        nowIndicator: true,

        dayMaxEvents: 3,

        editable: true,

        selectable: false,

        eventDisplay: 'block',

        headerToolbar: isMobile
            ? {
                left: 'prev,next',
                center: 'title',
                right: 'today'
            }
            : {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek'
            },

        footerToolbar: isMobile
            ? {
                left: '',
                center: 'dayGridMonth,timeGridWeek,listWeek',
                right: ''
            }
            : false,

        buttonText: {
            today: 'Hoje',
            month: 'Mês',
            week: 'Semana',
            list: 'Lista'
        },

        events: [

            {
                title: 'Prova de Matemática',

                start: '2026-06-15',

                backgroundColor: eventColors.prova,

                borderColor: eventColors.prova,

                extendedProps: {
                    descricao: 'Avaliação de Matemática.'
                }
            },

            {
                title: 'Reunião Pedagógica',

                start: '2026-06-20',

                backgroundColor: eventColors.reuniao,

                borderColor: eventColors.reuniao,

                extendedProps: {
                    descricao: 'Reunião pedagógica da equipe.'
                }
            },

            {
                title: 'Entrega de Boletins',

                start: '2026-06-25',

                backgroundColor: eventColors.entrega,

                borderColor: eventColors.entrega,

                extendedProps: {
                    descricao: 'Data de entrega dos boletins.'
                }
            }
        ],

        dateClick: function (info) {

            abrirNovoEvento(info);

        },

        eventClick: function (info) {

            info.jsEvent.preventDefault();

            abrirDetalhesEvento(info);

        }
    });

    calendar.render();

});