import uuid
from django.core.management.base import BaseCommand
from api.models import User


class Command(BaseCommand):
    help = 'Create an admin user in the app User model'

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True, help='Admin email')
        parser.add_argument('--password', required=True, help='Admin password')
        parser.add_argument('--name', default='Admin', help='Admin display name')

    def handle(self, *args, **options):
        email = options['email'].strip().lower()
        password = options['password']
        name = options['name']

        if User.objects.filter(email=email).exists():
            user = User.objects.get(email=email)
            user.role = 'admin'
            user.set_password(password)
            user.is_active = True
            user.save()
            self.stdout.write(self.style.SUCCESS(
                f'Updated existing user "{email}" to admin with new password.'
            ))
        else:
            user_id = f"user-{uuid.uuid4().hex[:12]}"
            user = User.objects.create(
                user_id=user_id,
                email=email,
                name=name,
                role='admin',
                is_active=True,
            )
            user.set_password(password)
            user.save()
            self.stdout.write(self.style.SUCCESS(
                f'Created admin user: {email} (user_id: {user_id})'
            ))
