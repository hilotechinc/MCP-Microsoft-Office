/**
 * @fileoverview UI logic for MCP connection checks: mail, calendar, etc.
 * Adds buttons to check mail/calendar connections and display results in the UI.
 */

export function addConnectionChecks(root, apiBase = '/api') {
    console.log('MCP Desktop: Adding connection checks to UI');

    // Create connection check container using modern design system
    const container = document.createElement('div');
    container.className = 'service-connections card';
    
    // Create card header
    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header';
    
    // Add heading
    const heading = document.createElement('h3');
    heading.className = 'card-title';
    heading.textContent = 'Check Service Connections';
    cardHeader.appendChild(heading);
    container.appendChild(cardHeader);
    
    // Create card body
    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';
    
    // Add button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'connection-buttons';
    cardBody.appendChild(buttonContainer);
    
    // Add results container
    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'connection-results';
    resultsContainer.className = 'test-results mt-4 hidden';
    cardBody.appendChild(resultsContainer);
    
    // Add card body to container
    container.appendChild(cardBody);
    
    // Create connection check buttons
    const services = [
        { name: 'Mail', endpoint: 'mail', color: '#0078d4' },
        { name: 'Calendar', endpoint: 'calendar', color: '#5c2d91' },
        { name: 'Files', endpoint: 'files', color: '#107c41' }
    ];
    
    services.forEach(service => {
        const button = document.createElement('button');
        button.textContent = `Check ${service.name}`;
        
        // Use modern button classes based on service type
        let btnClass = 'btn ';
        switch(service.endpoint) {
            case 'mail':
                btnClass += 'btn-primary';
                break;
            case 'calendar':
                btnClass += 'btn-secondary';
                break;
            case 'files':
                btnClass += 'btn-accent';
                break;
            default:
                btnClass += 'btn-outline';
        }
        
        button.className = `check-${service.endpoint}-btn ${btnClass}`;
        
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

    // Function to display formatted results using modern design system
    function showResults(title, data, modal = false) {
        // Safely format the JSON data
        let prettyData;
        try {
            prettyData = JSON.stringify(data, null, 2);
        } catch (error) {
            console.error('Error formatting data:', error);
            prettyData = 'Error formatting data: ' + (error.message || 'Unknown error');
        }
        
        if (modal) {
            // Use a modern modal dialog
            const modalContainer = document.createElement('div');
            modalContainer.className = 'modal-overlay';
            modalContainer.style.position = 'fixed';
            modalContainer.style.top = '0';
            modalContainer.style.left = '0';
            modalContainer.style.width = '100%';
            modalContainer.style.height = '100%';
            modalContainer.style.backgroundColor = 'rgba(0,0,0,0.4)';
            modalContainer.style.backdropFilter = 'blur(4px)';
            modalContainer.style.display = 'flex';
            modalContainer.style.alignItems = 'center';
            modalContainer.style.justifyContent = 'center';
            modalContainer.style.zIndex = '1000';
            
            const modalContent = document.createElement('div');
            modalContent.className = 'card';
            modalContent.style.backgroundColor = 'var(--neutral-100)';
            modalContent.style.padding = '0';
            modalContent.style.borderRadius = 'var(--radius-lg)';
            modalContent.style.maxWidth = '800px';
            modalContent.style.width = '90%';
            modalContent.style.maxHeight = '80%';
            modalContent.style.overflow = 'hidden';
            modalContent.style.boxShadow = 'var(--shadow-lg)';
            modalContent.style.position = 'relative';
            modalContent.style.display = 'flex';
            modalContent.style.flexDirection = 'column';
            
            // Create modal header
            const modalHeader = document.createElement('div');
            modalHeader.className = 'card-header';
            modalHeader.style.display = 'flex';
            modalHeader.style.justifyContent = 'space-between';
            modalHeader.style.alignItems = 'center';
            modalHeader.style.padding = '20px 24px';
            modalHeader.style.borderBottom = '1px solid var(--neutral-90)';
            
            // Create modal title
            const modalTitle = document.createElement('h3');
            modalTitle.className = 'card-title';
            modalTitle.textContent = title;
            modalTitle.style.margin = '0';
            modalHeader.appendChild(modalTitle);
            
            // Create close button
            const closeButton = document.createElement('button');
            closeButton.className = 'btn btn-outline';
            closeButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            `;
            closeButton.style.minWidth = 'auto';
            closeButton.style.padding = '8px';
            closeButton.style.height = '36px';
            closeButton.style.width = '36px';
            closeButton.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
            modalHeader.appendChild(closeButton);
            
            // Create modal body
            const modalBody = document.createElement('div');
            modalBody.className = 'card-body';
            modalBody.style.padding = '24px';
            modalBody.style.overflow = 'auto';
            
            // Create pre element for code
            const pre = document.createElement('pre');
            pre.className = 'test-results';
            pre.style.margin = '0';
            pre.style.maxHeight = '500px';
            pre.textContent = prettyData;
            modalBody.appendChild(pre);
            
            // Add header and body to modal content
            modalContent.appendChild(modalHeader);
            modalContent.appendChild(modalBody);
            modalContainer.appendChild(modalContent);
            
            document.body.appendChild(modalContainer);
        } else {
            // Update the results container with modern styling
            resultsContainer.classList.remove('hidden');
            resultsContainer.innerHTML = `
                <div class="card-header" style="padding:16px;background-color:var(--neutral-95);border-bottom:1px solid var(--neutral-90);margin:-16px -16px 16px -16px;">
                    <h4 style="margin:0;font-size:16px;font-weight:600;color:var(--neutral-20);">${title}</h4>
                </div>
                <pre style="margin:0;font-family:var(--font-mono);font-size:13px;line-height:1.5;">${prettyData}</pre>
            `;
            
            // Scroll to the results
            resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    // Add the container to the root element
    root.appendChild(container);
    
    console.log('MCP Desktop: Connection checks added successfully');
    
    // Return the container for potential future reference
    return container;
}
