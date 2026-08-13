document.addEventListener('DOMContentLoaded', function () {

    const calendarEl = document.getElementById('calendar');
    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    const calendar = new FullCalendar.Calendar(calendarEl, {
        locale: 'pt-br',
        initialView: isMobile ? 'listWeek' : 'dayGridMonth',
        height: 'auto',
        contentHeight: 'auto',
        aspectRatio: isMobile ? 0.9 : 1.35,

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
            ? { left: '', center: 'dayGridMonth,timeGridWeek,listWeek', right: '' }
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
                start: '2026-06-15'
            },
            {
                title: 'Reunião Pedagógica',
                start: '2026-06-20'
            },
            {
                title: 'Entrega de Boletins',
                start: '2026-06-25'
            }
        ],

        dateClick: function(info) {

            Swal.fire({
                title: 'Novo Evento',
                html: `
                    <input id="tituloEvento" class="swal2-input" placeholder="Nome do evento">
                    <input id="descricaoEvento" class="swal2-input" placeholder="Descrição">
                `,
                showCancelButton: true,
                confirmButtonText: 'Salvar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#e11233',  // ← adicione aqui
                cancelButtonColor: '#6c757d',   // ← e aqui (opcional)
        
                preConfirm: () => {
        
                    const titulo = document.getElementById('tituloEvento').value;
                    const descricao = document.getElementById('descricaoEvento').value;
        
                    if (!titulo) {
                        Swal.showValidationMessage('Digite um título');
                        return false;
                    }
        
                    return {
                        titulo,
                        descricao
                    };
                }
        
            }).then((result) => {
        
                if (result.isConfirmed) {
        
                    calendar.addEvent({
                        title: result.value.titulo,
                        start: info.dateStr,
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
                        timer: 1500,
                        showConfirmButton: false
                    });
                }
        
            });
        
        },
        eventClick: function(info) {

            Swal.fire({
                title: 'Novo Evento',
            
                html: `
                    <input id="tituloEvento" class="swal2-input" placeholder="Nome do evento">
                    <input id="descricaoEvento" class="swal2-input" placeholder="Descrição">
                `,
            
                showCancelButton: true,
            
                confirmButtonText: 'Salvar',
                cancelButtonText: 'Cancelar',
            
                background: '#ffffff',
                color: '#333',
            
                confirmButtonColor: '#e11233',
                cancelButtonColor: '#6c757d',
            
                customClass: {
                    popup: 'meu-alerta'
                },
            
                preConfirm: () => {
                    const titulo = document.getElementById('tituloEvento').value;
                    const descricao = document.getElementById('descricaoEvento').value;
            
                    if (!titulo) {
                        Swal.showValidationMessage('Digite um título');
                        return false;
                    }
            
                    return { titulo, descricao };
                }
            });
        
        }
    });

    calendar.render();

});