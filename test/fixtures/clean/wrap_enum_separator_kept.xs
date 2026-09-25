function "example" {
  input {
    // commented wrapped enum keeps its separator
    enum commented {
      values = [
        "alpha"
        "bravo"
        "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      ]
    
    }
    enum uncommented {
      values = [
        "alpha"
        "bravo"
        "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      ]
    }
  }

  stack {
  }

  response = $ok
}