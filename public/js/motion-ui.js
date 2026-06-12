(function () {
    function ready(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn, { once: true });
        } else {
            fn();
        }
    }

    function prefersReducedMotion() {
        return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    }

    function getPreviousRoute() {
        try {
            return sessionStorage.getItem('gvi_previous_route') || '';
        } catch (_) {
            return '';
        }
    }

    function markRouteSeen() {
        try {
            sessionStorage.setItem('gvi_previous_route', window.location.pathname);
            sessionStorage.removeItem('gvi_next_route');
        } catch (_) {}
    }

    function getClockParts() {
        const chip = document.getElementById('topbarClockChip');
        if (!chip) return null;

        return {
            chip,
            notification: document.querySelector('.notification-toggle'),
            profile: document.querySelector('.user-switch'),
            windows: document.querySelector('.topbar-window-group')
        };
    }

    function clockTargetWidth(chip) {
        const previous = {
            width: chip.style.width,
            flexBasis: chip.style.flexBasis,
            minWidth: chip.style.minWidth,
            paddingLeft: chip.style.paddingLeft,
            paddingRight: chip.style.paddingRight,
            display: chip.style.display
        };

        chip.style.width = '';
        chip.style.flexBasis = '';
        chip.style.minWidth = '124px';
        chip.style.paddingLeft = '17px';
        chip.style.paddingRight = '17px';

        const width = Math.ceil(Math.max(chip.getBoundingClientRect().width, chip.scrollWidth, 124));

        chip.style.width = previous.width;
        chip.style.flexBasis = previous.flexBasis;
        chip.style.minWidth = previous.minWidth;
        chip.style.paddingLeft = previous.paddingLeft;
        chip.style.paddingRight = previous.paddingRight;
        chip.style.display = previous.display;

        return width;
    }

    function setClockOpen() {
        const parts = getClockParts();
        if (!parts) return;
        const { chip, notification, profile, windows } = parts;
        const finalWidth = clockTargetWidth(chip);

        chip.dataset.motionWidth = String(finalWidth);
        chip.dataset.motionReady = 'true';
        chip.dataset.motionMode = 'static-open';
        chip.style.overflow = 'hidden';
        chip.style.width = `${finalWidth}px`;
        chip.style.flexBasis = `${finalWidth}px`;
        chip.style.minWidth = `${finalWidth}px`;
        chip.style.paddingLeft = '17px';
        chip.style.paddingRight = '17px';
        chip.style.opacity = '1';
        chip.style.scale = '1';
        chip.style.overflow = 'visible';
        [notification, profile, windows].filter(Boolean).forEach(el => {
            el.style.transform = '';
        });
    }

    function animateClockOpen(Motion) {
        const parts = getClockParts();
        if (!parts || parts.chip.dataset.motionReady === 'true') return;
        const { chip, notification, profile, windows } = parts;
        const finalWidth = clockTargetWidth(chip);

        chip.dataset.motionWidth = String(finalWidth);
        chip.dataset.motionReady = 'true';
        chip.dataset.motionMode = 'animated-open';
        chip.dataset.motionClosing = 'false';
        chip.style.overflow = 'hidden';
        chip.style.minWidth = '0px';
        chip.style.flexBasis = '0px';
        chip.style.width = '0px';
        chip.style.paddingLeft = '0px';
        chip.style.paddingRight = '0px';
        chip.style.opacity = '0';
        chip.style.transformOrigin = 'center';

        Motion.animate(notification, { x: [16, 0] }, {
            duration: 0.36,
            easing: [0.16, 1, 0.3, 1]
        });

        Motion.animate([profile, windows].filter(Boolean), { x: [-16, 0] }, {
            duration: 0.36,
            easing: [0.16, 1, 0.3, 1]
        });

        const clockAnimation = Motion.animate(chip, {
            width: ['0px', `${finalWidth}px`],
            flexBasis: ['0px', `${finalWidth}px`],
            minWidth: ['0px', `${finalWidth}px`],
            paddingLeft: ['0px', '17px'],
            paddingRight: ['0px', '17px'],
            opacity: [0, 1],
            scale: [0.98, 1]
        }, {
            duration: 0.42,
            easing: [0.16, 1, 0.3, 1]
        });

        clockAnimation.finished?.then(() => {
            if (chip.dataset.motionClosing === 'true') return;
            chip.style.width = `${finalWidth}px`;
            chip.style.flexBasis = `${finalWidth}px`;
            chip.style.minWidth = `${finalWidth}px`;
            chip.style.paddingLeft = '17px';
            chip.style.paddingRight = '17px';
            chip.style.opacity = '1';
            chip.style.overflow = 'visible';
        }).catch(() => null);
    }

    function collapseClock(Motion) {
        const parts = getClockParts();
        if (!parts) return;
        const { chip, notification, profile, windows } = parts;
        if (!chip || chip.dataset.motionReady !== 'true') return;
        if (chip.dataset.motionClosing === 'true') return;
        chip.dataset.motionClosing = 'true';

        const width = Number(chip.dataset.motionWidth || chip.getBoundingClientRect().width || 0);

        Motion.animate(notification, { x: [0, 10] }, {
            duration: 0.22,
            easing: [0.4, 0, 1, 1]
        });

        Motion.animate([profile, windows].filter(Boolean), { x: [0, -10] }, {
            duration: 0.22,
            easing: [0.4, 0, 1, 1]
        });

        const clockAnimation = Motion.animate(chip, {
            width: [`${width}px`, '0px'],
            flexBasis: [`${width}px`, '0px'],
            minWidth: [`${width}px`, '0px'],
            paddingLeft: ['17px', '0px'],
            paddingRight: ['17px', '0px'],
            opacity: [1, 0],
            scale: [1, 0.98]
        }, {
            duration: 0.26,
            easing: [0.4, 0, 1, 1]
        });

        clockAnimation.finished?.then(() => {
            chip.style.width = '0px';
            chip.style.flexBasis = '0px';
            chip.style.minWidth = '0px';
            chip.style.paddingLeft = '0px';
            chip.style.paddingRight = '0px';
            chip.style.opacity = '0';
        }).catch(() => null);
    }

    function watchRouteExit(Motion) {
        const body = document.body;
        if (!body) return;

        const observer = new MutationObserver(() => {
            if (body.classList.contains('content-leaving') && body.dataset.routeDestino === '/') {
                collapseClock(Motion);
            }
            if (body.classList.contains('content-leaving')) {
                animatePageOut(Motion);
            }
        });

        observer.observe(body, { attributes: true, attributeFilter: ['class'] });
    }

    function pageRoot() {
        return document.querySelector('.home-dashboard, .productos-shell, .contenedor, .dashboard-container, main');
    }

    function animatePageIn(Motion) {
        const root = pageRoot();
        if (!root || root.dataset.motionPageReady === 'true') return;
        root.dataset.motionPageReady = 'true';
        root.style.transformOrigin = 'top center';

        Motion.animate(root, {
            opacity: [0, 1],
            y: [18, 0],
            scale: [0.992, 1]
        }, {
            duration: 0.42,
            easing: [0.16, 1, 0.3, 1]
        });
    }

    function animatePageOut(Motion) {
        const root = pageRoot();
        if (!root || root.dataset.motionPageLeaving === 'true') return;
        root.dataset.motionPageLeaving = 'true';
        root.style.transformOrigin = 'top center';

        Motion.animate(root, {
            opacity: [1, 0],
            y: [0, 14],
            scale: [1, 0.994]
        }, {
            duration: 0.18,
            easing: [0.4, 0, 1, 1]
        });
    }

    function animateHome(Motion) {
        if (window.location.pathname !== '/') return;

        const headerItems = document.querySelectorAll('.home-kicker, .home-title, .home-subtitle, .home-clock-card');
        const metricCards = document.querySelectorAll('.metric-card');
        const panels = document.querySelectorAll('.dashboard-panel');

        Motion.animate(headerItems, {
            opacity: [0, 1],
            y: [-14, 0]
        }, {
            delay: Motion.stagger(0.045),
            duration: 0.46,
            easing: [0.16, 1, 0.3, 1]
        });

        Motion.animate(metricCards, {
            opacity: [0, 1],
            y: [-12, 0],
            scale: [0.985, 1]
        }, {
            delay: Motion.stagger(0.045, { startDelay: 0.12 }),
            duration: 0.42,
            easing: [0.16, 1, 0.3, 1]
        });

        Motion.animate(panels, {
            opacity: [0, 1],
            y: [-10, 0]
        }, {
            delay: Motion.stagger(0.055, { startDelay: 0.22 }),
            duration: 0.4,
            easing: [0.16, 1, 0.3, 1]
        });
    }

    function notificationPopoverParts() {
        const popover = document.getElementById('notificationsPopover');
        const button = document.querySelector('.notification-toggle');
        return { popover, button };
    }

    function visibleNotificationRows(popover) {
        if (!popover) return [];
        return Array.from(popover.querySelectorAll('.notification-item, .notifications-empty'))
            .filter(item => !item.hidden);
    }

    function positionNotificationsPopover(popover, button) {
        if (!popover || !button) return;

        const buttonRect = button.getBoundingClientRect();
        const width = Math.min(320, Math.max(300, popover.offsetWidth || 310));
        const left = Math.min(
            Math.max(16, buttonRect.left + (buttonRect.width / 2) - (width / 2)),
            window.innerWidth - width - 16
        );

        popover.style.width = `${width}px`;
        popover.style.left = `${Math.round(left)}px`;
        popover.style.right = 'auto';
        popover.style.top = `${Math.round(buttonRect.bottom + 12)}px`;
        popover.style.transformOrigin = `${Math.round(buttonRect.left + (buttonRect.width / 2) - left)}px top`;
    }

    function openNotifications(Motion) {
        const { popover, button } = notificationPopoverParts();
        if (!popover || !button) return;

        popover.dataset.motionOpen = 'true';
        popover.classList.add('open');
        positionNotificationsPopover(popover, button);

        Motion.animate(popover, {
            opacity: [0, 1],
            y: [-8, 0],
            scale: [0.965, 1]
        }, {
            duration: 0.2,
            easing: [0.16, 1, 0.3, 1]
        });

        Motion.animate(visibleNotificationRows(popover), {
            opacity: [0, 1],
            y: [7, 0]
        }, {
            delay: Motion.stagger(0.035, { startDelay: 0.035 }),
            duration: 0.2,
            easing: [0.16, 1, 0.3, 1]
        });
    }

    function closeNotifications(Motion) {
        const { popover } = notificationPopoverParts();
        if (!popover || !popover.classList.contains('open')) return;

        popover.dataset.motionOpen = 'false';
        const animation = Motion.animate(popover, {
            opacity: [1, 0],
            y: [0, -6],
            scale: [1, 0.975]
        }, {
            duration: 0.14,
            easing: [0.4, 0, 1, 1]
        });

        animation.finished?.then(() => {
            if (popover.dataset.motionOpen === 'true') return;
            popover.classList.remove('open');
            popover.style.opacity = '';
            popover.style.transform = '';
        }).catch(() => null);
    }

    function setupNotificationMotion(Motion) {
        window.gviMotionPositionNotifications = () => {
            const { popover, button } = notificationPopoverParts();
            if (popover?.classList.contains('open')) positionNotificationsPopover(popover, button);
        };
        window.gviMotionOpenNotifications = () => openNotifications(Motion);
        window.gviMotionCloseNotifications = () => closeNotifications(Motion);
        window.gviMotionToggleNotifications = () => {
            const { popover } = notificationPopoverParts();
            if (popover?.classList.contains('open')) {
                closeNotifications(Motion);
            } else {
                openNotifications(Motion);
            }
        };
        window.addEventListener('resize', window.gviMotionPositionNotifications);
    }

    ready(() => {
        const Motion = window.Motion;
        if (!Motion || prefersReducedMotion()) {
            if (window.location.pathname !== '/') setClockOpen();
            window.gviMotionPositionNotifications = () => {
                const { popover, button } = notificationPopoverParts();
                if (popover?.classList.contains('open')) positionNotificationsPopover(popover, button);
            };
            window.gviMotionOpenNotifications = () => {
                const { popover, button } = notificationPopoverParts();
                popover?.classList.add('open');
                positionNotificationsPopover(popover, button);
            };
            window.gviMotionCloseNotifications = () => {
                notificationPopoverParts().popover?.classList.remove('open');
            };
            window.gviMotionToggleNotifications = () => {
                const { popover, button } = notificationPopoverParts();
                if (!popover) return;
                popover.classList.toggle('open');
                positionNotificationsPopover(popover, button);
            };
            return;
        }

        if (window.location.pathname === '/') {
            markRouteSeen();
        } else if (getPreviousRoute() === '/') {
            animateClockOpen(Motion);
            markRouteSeen();
        } else {
            setClockOpen();
            markRouteSeen();
        }
        animatePageIn(Motion);
        animateHome(Motion);
        watchRouteExit(Motion);
        setupNotificationMotion(Motion);

        window.gviMotionPrepareRoute = (destino) => {
            if (destino === '/') collapseClock(Motion);
            animatePageOut(Motion);
        };
    });
})();
