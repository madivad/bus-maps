# app.py (This is the NEW top-level file for Gunicorn)

# Import the app object from application.py and the function to initialize data
from application import app, initialize_app_data

# Import routes to ensure they are registered with the app object
import routes # noqa: F401 -> Tell linters this import is used (for route registration)

# Call initialization function for any app-level data loading
initialize_app_data()

# The Gunicorn server will pick up the 'app' object from application.py
# when this file (app.py) is specified as the module.

# If you want to run this with 'python app.py' for local development:
if __name__ == '__main__':
    # Make sure to use the app object imported from application.py
    # The host and port can be configured as needed for development
    app.run(debug=True, host='0.0.0.0', port=5000)