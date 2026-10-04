from django.shortcuts import render
from django.http import HttpResponse

def home(request):
    return render(request, 'pmo/home.html')

def change_text(request):
    if request.method == 'POST':
        return HttpResponse('<p class="text-green-700 font-medium">The button was clicked! Text changed via HTMX.</p>')
    return HttpResponse('', status=405)
