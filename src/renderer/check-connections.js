// @fileoverview UI logic for MCP connection checks: mail, calendar, etc.
// Adds buttons to check mail/calendar connections and display results in the UI.

export function addConnectionChecks(root, apiBase = '/api') {
    // Attach debug button listeners if present in DOM
    const debugMailBtn = document.getElementById('debug-mail-btn');
    const debugCalBtn = document.getElementById('debug-calendar-btn');
    if (debugMailBtn) {
        debugMailBtn.onclick = async () => {
            debugMailBtn.disabled = true;
            debugMailBtn.textContent = 'Debugging...';
            try {
                const res = await fetch(`${apiBase}/v1/mail?limit=1&debug=true`);
                const data = await res.json();
                showDebugModal('Mail Debug', data);
            } catch (e) {
                showDebugModal('Mail Debug', { error: e.message });
            } finally {
                debugMailBtn.disabled = false;
                debugMailBtn.textContent = 'Debug Mail';
            }
        };
    }
    if (debugCalBtn) {
        debugCalBtn.onclick = async () => {
            debugCalBtn.disabled = true;
            debugCalBtn.textContent = 'Debugging...';
            try {
                const res = await fetch(`${apiBase}/v1/calendar?limit=1&debug=true`);
                const data = await res.json();
                showDebugModal('Calendar Debug', data);
            } catch (e) {
                showDebugModal('Calendar Debug', { error: e.message });
            } finally {
                debugCalBtn.disabled = false;
                debugCalBtn.textContent = 'Debug Calendar';
            }
        };
    }

    const container = document.createElement('div');
    container.className = 'connection-checks';
    container.style.margin = '32px 0';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.gap = '12px';

    // No connection check buttons or results area remain

    function showDebugModal(title, data) {
        const pretty = JSON.stringify(data, null, 2);
        alert(`${title}\n\n${pretty}`);
        // In future: Replace with a modal dialog for better UX
    }

    root.appendChild(container);
}
