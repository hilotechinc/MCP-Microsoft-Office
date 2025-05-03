/**
 * @fileoverview UI logic for MCP connection checks: mail, calendar, etc.
 * Adds buttons to check mail/calendar connections and display results in the UI.
 */

export function addConnectionChecks(root, apiBase = '/api') {
    console.log('MCP Desktop: Adding connection checks to UI');

    // Create connection check container
    const container = document.createElement('div');
    container.className = 'connection-checks';
    container.style.margin = '32px 0';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.gap = '12px';
    
    // Add heading
    const heading = document.createElement('h3');
    heading.textContent = 'Check Service Connections';
    heading.style.marginBottom = '12px';
    container.appendChild(heading);
    
    // Add button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '12px';
    buttonContainer.style.marginBottom = '16px';
    container.appendChild(buttonContainer);
    
    // Add results container
    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'connection-results';
    resultsContainer.style.width = '100%';
    resultsContainer.style.maxWidth = '800px';
    resultsContainer.style.padding = '16px';
    resultsContainer.style.backgroundColor = '#f8f8f8';
    resultsContainer.style.borderRadius = '4px';
    resultsContainer.style.display = 'none';
    container.appendChild(resultsContainer);
    
    // Create connection check buttons
    const services = [
        { name: 'Mail', endpoint: 'mail', color: '#0078d4' },
        { name: 'Calendar', endpoint: 'calendar', color: '#5c2d91' },
        { name: 'Files', endpoint: 'files', color: '#107c41' }
    ];
    
    services.forEach(service => {
        const button = document.createElement('button');
        button.textContent = `Check ${service.name}`;
        button.className = `check-${service.endpoint}-btn`;
        button.style.padding = '8px 16px';
        button.style.backgroundColor = service.color;
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';
        
        button.addEventListener('click', async () => {
            // Update button state
            button.disabled = true;
            button.textContent = `Checking ${service.name}...`;
            
            // Show results container
            resultsContainer.style.display = 'block';
            resultsContainer.innerHTML = `<div style="text-align: center;">Checking ${service.name} service...</div>`;
            
            try {
                // Fetch service status
                const response = await fetch(`${apiBase}/v1/${service.endpoint}?limit=1&debug=true`);
                const data = await response.json();
                
                // Display results
                showResults(`${service.name} Connection Test`, data);
            } catch (error) {
                showResults(`${service.name} Connection Test Failed`, { 
                    error: error.message,
                    endpoint: `${apiBase}/v1/${service.endpoint}`
                });
            } finally {
                // Reset button state
                button.disabled = false;
                button.textContent = `Check ${service.name}`;
            }
        });
        
        buttonContainer.appendChild(button);
    });
    
    // Also attach to existing debug buttons if present in DOM
    const existingButtons = [
        { id: 'debug-mail-btn', endpoint: 'mail', name: 'Mail' },
        { id: 'debug-calendar-btn', endpoint: 'calendar', name: 'Calendar' },
        { id: 'debug-files-btn', endpoint: 'files', name: 'Files' }
    ];
    
    existingButtons.forEach(({ id, endpoint, name }) => {
        const button = document.getElementById(id);
        if (button) {
            console.log(`MCP Desktop: Found existing ${name} button, attaching handler`);
            
            button.addEventListener('click', async () => {
                button.disabled = true;
                const originalText = button.textContent;
                button.textContent = `Checking ${name}...`;
                
                try {
                    const response = await fetch(`${apiBase}/v1/${endpoint}?limit=1&debug=true`);
                    const data = await response.json();
                    showResults(`${name} Connection Test`, data, true);
                } catch (error) {
                    showResults(`${name} Connection Test Failed`, { 
                        error: error.message,
                        endpoint: `${apiBase}/v1/${endpoint}`
                    }, true);
                } finally {
                    button.disabled = false;
                    button.textContent = originalText;
                }
            });
        }
    });

    // Function to display formatted results
    function showResults(title, data, modal = false) {
        // Format the JSON data
        const prettyData = JSON.stringify(data, null, 2);
        
        if (modal) {
            // Use a better modal dialog instead of alert
            const modalContainer = document.createElement('div');
            modalContainer.style.position = 'fixed';
            modalContainer.style.top = '0';
            modalContainer.style.left = '0';
            modalContainer.style.width = '100%';
            modalContainer.style.height = '100%';
            modalContainer.style.backgroundColor = 'rgba(0,0,0,0.5)';
            modalContainer.style.display = 'flex';
            modalContainer.style.alignItems = 'center';
            modalContainer.style.justifyContent = 'center';
            modalContainer.style.zIndex = '1000';
            
            const modalContent = document.createElement('div');
            modalContent.style.backgroundColor = 'white';
            modalContent.style.padding = '24px';
            modalContent.style.borderRadius = '8px';
            modalContent.style.maxWidth = '800px';
            modalContent.style.maxHeight = '80%';
            modalContent.style.overflow = 'auto';
            modalContent.style.position = 'relative';
            
            const modalTitle = document.createElement('h3');
            modalTitle.textContent = title;
            modalTitle.style.marginTop = '0';
            
            const closeButton = document.createElement('button');
            closeButton.textContent = 'Close';
            closeButton.style.position = 'absolute';
            closeButton.style.top = '16px';
            closeButton.style.right = '16px';
            closeButton.style.padding = '4px 8px';
            closeButton.style.backgroundColor = '#e0e0e0';
            closeButton.style.border = 'none';
            closeButton.style.borderRadius = '4px';
            closeButton.style.cursor = 'pointer';
            closeButton.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
            
            const pre = document.createElement('pre');
            pre.style.backgroundColor = '#f5f5f5';
            pre.style.padding = '16px';
            pre.style.borderRadius = '4px';
            pre.style.overflow = 'auto';
            pre.style.maxHeight = '500px';
            pre.textContent = prettyData;
            
            modalContent.appendChild(modalTitle);
            modalContent.appendChild(closeButton);
            modalContent.appendChild(pre);
            modalContainer.appendChild(modalContent);
            
            document.body.appendChild(modalContainer);
        } else {
            // Update the results container
            resultsContainer.innerHTML = `
                <h4 style="margin-top:0">${title}</h4>
                <pre style="background-color:#f5f5f5;padding:12px;border-radius:4px;overflow:auto;max-height:300px;">${prettyData}</pre>
            `;
        }
    }

    // Add the container to the root element
    root.appendChild(container);
    
    console.log('MCP Desktop: Connection checks added successfully');
    
    // Return the container for potential future reference
    return container;
}
