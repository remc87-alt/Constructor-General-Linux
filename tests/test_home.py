from django.test import TestCase, Client
from django.urls import reverse
from django.test import override_settings

@override_settings(ALLOWED_HOSTS=['testserver'])
class HomeViewTest(TestCase):
    def setUp(self):
        self.client = Client()

    def test_home_page_status_code(self):
        response = self.client.get(reverse('home'))
        self.assertEqual(response.status_code, 200)

    def test_htmx_button_exists(self):
        response = self.client.get(reverse('home'))
        self.assertContains(response, 'hx-post')
        self.assertContains(response, 'hx-target')
        self.assertContains(response, 'hx-swap')
