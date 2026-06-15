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

    function setupStaticNotificationControls() {
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
        window.gviMotionPrepareRoute = () => {};
        window.addEventListener('resize', window.gviMotionPositionNotifications);
    }

    function setupAnimatedNotificationControls(Motion) {
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
        window.gviMotionPrepareRoute = () => {};
        window.addEventListener('resize', window.gviMotionPositionNotifications);
    }

    ready(() => {
        const Motion = window.Motion;
        if (!Motion || prefersReducedMotion()) {
            setupStaticNotificationControls();
            return;
        }

        setupAnimatedNotificationControls(Motion);
    });
})();
