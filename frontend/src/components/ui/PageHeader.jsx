import { Link } from 'react-router-dom';
import Icon from './Icon';

export default function PageHeader({ title, description, actions, back }) {
  return (
    <header>
      {back ? (
        <Link to={back.to} className="back-link">
          <Icon name="arrowLeft" size={14} /> {back.label}
        </Link>
      ) : null}
      <div className="page-header">
        <div className="grow">
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="row">{actions}</div> : null}
      </div>
    </header>
  );
}
