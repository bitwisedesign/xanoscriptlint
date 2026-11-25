function "example" {
  input {
  }

  stack {
  }

  response = $ok

  test "rejects missing row" {
    input = {id: 1}
    expect.to_throw {
      exception = ""
    }
  }
}