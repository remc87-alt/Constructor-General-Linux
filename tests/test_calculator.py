from src.calculator import add, multiply


def test_add_two_positive_numbers() -> None:
    assert add(2, 3) == 5


def test_add_with_zero() -> None:
    assert add(7, 0) == 7


def test_multiply_two_positive_numbers() -> None:
    assert multiply(3, 4) == 12


def test_multiply_with_zero() -> None:
    assert multiply(5, 0) == 0
