# How to Reuse This Django Kit

This kit provides a reusable Django project with the following stack:
- Django
- Tailwind CSS (via CDN)
- HTMX (via CDN)
- Alpine.js (via CDN)
- django-htmx
- Unfold (for Django admin only)
- WhiteNoise

## Steps to Create a New Project

1. Copy this directory to a new location for your project.
2. Rename the project directory (currently `pmo_project`) and the application directory (currently `pmo`) to your desired names.
3. Update the following files to reflect the new names:
   - `manage.py`: change the Django settings module (if you changed the project name).
   - `pmo_project/settings.py`: change the `ROOT_URLCONF` and `WSGI_APPLICATION` if you renamed the project.
   - `pmo_project/urls.py`: change the include if you renamed the app.
   - The app directory inside `pmo_project` (if you renamed the app, update the `INSTALLED_APPS` in settings.py).
   - Also, update the import in the app's `urls.py`, `apps.py`, etc. if necessary.
4. Create a new virtual environment and install dependencies:
        python -m venv venv
        source venv/bin/activate
        pip install -r requirements.txt
5. Apply migrations:
        python manage.py migrate
6. Create a superuser for the admin:
        python manage.py createsuperuser
7. Run the development server:
        python manage.py runserver
8. Visit http://127.0.0.1:8000/ to see the example app (if you kept the `pmo` app) or your new app's home page.

## Customizing the Kit

- The base template is in `templates/base.html`. Override the `sidebar`, `content`, and other blocks in your app's templates.
- To add custom static files, place them in the `static/` directory (or in an app's `static/` directory) and they will be served by WhiteNoise.
- For production, consider configuring WhiteNoise for compression and caching (already set up in `settings.py`).

## Notes

- This kit uses CDN for Tailwind, Alpine.js, and HTMX. For production without internet access, consider downloading and serving these files locally.
- Unfold is only installed for the Django admin. To use it, visit `/admin/` and log in with your superuser account.

## Example App

The included `pmo` app is an example of how to use HTMX to update the page without a full reload. It is located in the `pmo` directory.