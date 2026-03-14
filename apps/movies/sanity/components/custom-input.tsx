import type {StringInputProps} from 'sanity'

export function CustomInput(props: StringInputProps) {
  console.log(props)
  return (
    <>
      <button onClick={() => alert('Hello')}>Click me</button>
      {props.renderDefault(props)}
    </>
  )
}
