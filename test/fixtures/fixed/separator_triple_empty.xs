agent example {
  llm = {
    type         : "openai"
    system_prompt: """
      Translate the field.
      
      Return only the text.
      """
    prompt       : """
      Begin with the source.
      
      Then return the result.
      """
  }
}

function "example" {
  input {
  }

  stack {
    api.lambda {
      code = """
          const value = 1
        
          return value
        """
    } as $out
  }

  response = $out
}
