document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        // Simple authentication (for demo purposes)
        if (username === 'admin' && password === 'password') {
            // Request microphone permission on login
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(function(stream) {
                    // Permission granted
                    stream.getTracks().forEach(track => track.stop());
                    // Store login status
                    sessionStorage.setItem('isLoggedIn', 'true');
                    sessionStorage.setItem('username', username);
                    // Redirect to client form
                    window.location.href = 'client-form.html';
                })
                .catch(function(error) {
                    alert('Microphone access is required to use the application. Please allow microphone access and try again.');
                });
        } else {
            alert('Invalid credentials. Please use admin/password for demo.');
        }
    });
});
