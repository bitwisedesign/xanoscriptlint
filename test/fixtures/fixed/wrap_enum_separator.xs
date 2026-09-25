function "example" {
  input {
    // commented enum needs a separator
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
    // wrap this one with a separator
    enum wrapping {
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