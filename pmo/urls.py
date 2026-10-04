from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('change-text/', views.change_text, name='change_text'),
]
