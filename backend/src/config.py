import os


def get_database_url() -> str:
    postgres_user = os.getenv("POSTGRES_USER", "postgres")
    postgres_password = os.getenv("POSTGRES_PASSWORD", "postgres")
    postgres_server = os.getenv("POSTGRES_SERVER", "db")
    postgres_port = os.getenv("POSTGRES_PORT", "5432")
    postgres_db = os.getenv("POSTGRES_DB", "app")

    return (
        f"postgresql://{postgres_user}:{postgres_password}"
        f"@{postgres_server}:{postgres_port}/{postgres_db}"
    )
