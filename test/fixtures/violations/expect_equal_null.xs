function "example" {
  input {
  }

  stack {
  }

  response = $ok

  test "omits coupon when cart has no code" {
    input = {id: 1}
    expect.to_equal ($response.coupon_code) {
      value = null
    }
  }
}